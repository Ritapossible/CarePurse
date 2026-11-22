// Sign-up on Stellar: one purse contract per family, with the daughter's Privy wallet as guardian.
//
//   prepare   Mhasibu deploys the family's purse contract (guardian = her Stellar address, agent =
//             Mhasibu, USDC), then builds `configure` (her caps, the meter and phone fingerprints,
//             the monthly cap) and asks the network which signature it needs: hers, as guardian.
//             It returns only that authorisation's hash (32 bytes, hex).
//   complete  Her browser signs the hash with Privy (signRawHash, Ed25519). The SDK checks the
//             signature against her address, Mhasibu attaches it, pays the fee and submits.
//
// She never needs XLM or USDC to sign up, and never sees a seed phrase. Only her signature can
// change the purse's rules afterwards (the contract enforces it).
import crypto from "node:crypto";
import { Address, Asset, Contract, Keypair, Networks, Operation, TransactionBuilder, BASE_FEE, authorizeEntry, rpc, xdr } from "@stellar/stellar-sdk";
import { MIN_TOPUP, monthlyCap } from "./limits.mjs";
import { addressVal, bytes32, capBaseUnits, capRate, createSoroban, destHash, i128, retryOnBadSeq, symbol, withAccount } from "./purse-contract.mjs";

const UTILITIES = ["electricity", "airtime", "data"];
const AUTH_LEDGERS = 120; // the signature request stays valid ~10 minutes

// Caps in USDC base units, from the naira limits (the same conversion as the demo purse).
function capsMap(limits, config) {
  const entries = UTILITIES.filter((u) => limits[u]).map((u) => {
    const l = limits[u];
    const caps = xdr.ScVal.scvMap(
      [["per_day", l.perDay], ["per_month", l.perMonth], ["per_topup", l.perTopup], ["per_week", l.perWeek]].map(
        ([k, v]) => new xdr.ScMapEntry({ key: symbol(k), val: i128(capBaseUnits(v ?? 0, capRate(config), MIN_TOPUP[u], config.usdc.decimals, config.serviceFeeBps)) }),
      ),
    );
    return new xdr.ScMapEntry({ key: symbol(u), val: caps });
  });
  return xdr.ScVal.scvMap(entries.sort((a, b) => a.key().sym().toString().localeCompare(b.key().sym().toString())));
}

function destsMap(destinations, contractId, config) {
  const entries = UTILITIES.filter((u) => destinations[u]).map(
    (u) => new xdr.ScMapEntry({ key: symbol(u), val: bytes32(destHash(destinations[u], { key: config.destHashKey, contractId })) }),
  );
  return xdr.ScVal.scvMap(entries.sort((a, b) => a.key().sym().toString().localeCompare(b.key().sym().toString())));
}

export function createSignup({ config, fetchImpl = fetch }) {
  const passphrase = config.networkPassphrase ?? Networks.TESTNET;
  const soroban = createSoroban({ rpcUrl: config.rpcUrl, networkPassphrase: passphrase });
  const server = soroban.server;
  const agent = Keypair.fromSecret(config.agentSecret);

  // The operator pays for (and is the source of) sign-ups, guardian calls, wallet creation and
  // top-ups: one at a time, rebuilt if its sequence number was stale.
  const asOperator = (fn) => withAccount(agent.publicKey(), () => retryOnBadSeq(fn));

  // Her address must exist on the ledger for the network to check her signature. On testnet,
  // Friendbot creates it (she still pays nothing: the fees are Mhasibu's).
  async function ensureAccount(address) {
    try {
      await server.getAccount(address);
    } catch {
      const res = await fetchImpl(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error(`could not create the guardian account on testnet (Friendbot HTTP ${res.status})`);
    }
  }

  // Each family gets its own agent wallet: Mhasibu's key for that purse only. The caller makes the
  // key and saves it (sealed) BEFORE calling this, so a timeout or crash never loses a funded
  // wallet: calling again with the same key finishes the job or finds it done (idempotent). The
  // operator creates the account and its USDC trustline in one transaction (the operator pays; the
  // new key signs its own trustline), with a little XLM for that family's network fees. No
  // Friendbot: this works the same on any network.
  const AGENT_START_XLM = String(config.agentStartXlm ?? "5");
  async function createAgentWallet({ secret }) {
    const kp = Keypair.fromSecret(secret);
    const exists = await server.getAccount(kp.publicKey()).then(() => true, () => false);
    if (exists) return { address: kp.publicKey(), created: false }; // created on an earlier try (one transaction: trustline included)
    await asOperator(async () => {
      const operator = await server.getAccount(agent.publicKey());
      const tx = new TransactionBuilder(operator, { fee: String(Number(BASE_FEE) * 2), networkPassphrase: passphrase })
        .addOperation(Operation.createAccount({ destination: kp.publicKey(), startingBalance: AGENT_START_XLM }))
        .addOperation(Operation.changeTrust({ asset: new Asset("USDC", config.usdc.issuer), source: kp.publicKey() }))
        .setTimeout(120)
        .build();
      tx.sign(agent, kp);
      return soroban.submit(tx);
    });
    return { address: kp.publicKey(), created: true };
  }

  // The current ledger: a guardian signature request is valid up to its `validUntil` ledger.
  const latestLedger = async () => (await server.getLatestLedger()).sequence;

  // Keep a family's agent wallet able to pay its network fees: below `min` XLM, the operator sends
  // it back up to the starting amount. Returns the XLM sent (0 if none was needed).
  async function topUpAgentXlm(address, { min = 2 } = {}) {
    const res = await fetchImpl(`${config.horizonUrl}/accounts/${address}`);
    if (!res.ok) return 0;
    const xlm = Number((await res.json()).balances?.find((b) => b.asset_type === "native")?.balance ?? 0);
    if (xlm >= min) return 0;
    const amount = (Number(AGENT_START_XLM) - xlm).toFixed(7);
    if (!(Number(amount) > 0)) return 0;
    await asOperator(async () => {
      const operator = await server.getAccount(agent.publicKey());
      const tx = new TransactionBuilder(operator, { fee: BASE_FEE, networkPassphrase: passphrase })
        .addOperation(Operation.payment({ destination: address, asset: Asset.native(), amount }))
        .setTimeout(120)
        .build();
      tx.sign(agent);
      return soroban.submit(tx);
    });
    return Number(amount);
  }

  // Close a family's agent wallet (her account is being deleted): remove its USDC trustline and
  // merge every XLM back to the operator. Refused if it still holds USDC (it holds 0 between
  // top-ups; anything else is an order to settle first). Already gone: nothing to do.
  async function closeAgentWallet({ secret }) {
    const kp = Keypair.fromSecret(secret);
    const res = await fetchImpl(`${config.horizonUrl}/accounts/${kp.publicKey()}`);
    if (res.status === 404) return { closed: false, reason: "not on the ledger" };
    if (!res.ok) throw new Error(`Stellar didn’t answer (HTTP ${res.status}). Please try again.`);
    const usdc = ((await res.json()).balances ?? []).find((b) => b.asset_code === "USDC" && b.asset_issuer === config.usdc.issuer);
    if (usdc && Number(usdc.balance) > 0) throw new Error(`Mhasibu’s wallet for this purse still holds ${usdc.balance} USDC from a top-up being settled. Try again in a few minutes.`);
    await withAccount(kp.publicKey(), () => retryOnBadSeq(async () => {
      const account = await server.getAccount(kp.publicKey());
      const tx = new TransactionBuilder(account, { fee: String(Number(BASE_FEE) * 2), networkPassphrase: passphrase });
      if (usdc) tx.addOperation(Operation.changeTrust({ asset: new Asset("USDC", config.usdc.issuer), limit: "0" }));
      const built = tx.addOperation(Operation.accountMerge({ destination: agent.publicKey() })).setTimeout(120).build();
      built.sign(kp);
      return soroban.submit(built);
    }));
    return { closed: true };
  }

  // Move an existing purse to its own agent wallet: `set_agent`, which only the guardian can call.
  async function prepareSetAgent({ contractId, guardianAddress, agentAddress }) {
    return prepareGuardianCall({ contractId, guardianAddress, method: "set_agent", args: [addressVal(agentAddress)] });
  }

  async function deployPurse(guardianAddress, agentAddress = agent.publicKey()) {
    if (!config.purseWasmHash) throw new Error("PURSE_WASM_HASH is not set: run npm run install-wasm");
    const created = await soroban.send(agent, Operation.createCustomContract({
      address: Address.fromString(agent.publicKey()),
      wasmHash: Buffer.from(config.purseWasmHash, "hex"),
      salt: crypto.randomBytes(32),
      constructorArgs: [addressVal(guardianAddress), addressVal(agentAddress), addressVal(config.usdc.contractId)],
    }));
    return { contractId: created.returnValue, tx: created.hash };
  }

  // Build a guardian call, simulate it, and return the hash she must sign plus everything needed
  // to finish it later. `method`/`args` are any guardian-only contract function.
  async function prepareGuardianCall({ contractId, guardianAddress, method, args }) {
    const account = await server.getAccount(agent.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
      .addOperation(new Contract(contractId).call(method, ...args)).setTimeout(300).build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(`simulation failed: ${sim.error.slice(0, 300)}`);
    const entry = (sim.result?.auth ?? []).find(
      (e) => e.credentials().switch().name === "sorobanCredentialsAddress" && Address.fromScAddress(e.credentials().address().address()).toString() === guardianAddress,
    );
    if (!entry) throw new Error("the network did not ask for the guardian's signature");
    const validUntil = (await server.getLatestLedger()).sequence + AUTH_LEDGERS;
    let hash = null;
    await authorizeEntry(entry, async (_preimage, payload) => {
      hash = Buffer.from(payload).toString("hex");
      return { signature: Buffer.alloc(64), publicKey: Keypair.random().publicKey() };
    }, validUntil, passphrase).catch(() => {}); // only the payload was needed; the dummy signature fails on purpose
    if (!hash) throw new Error("could not compute the signature payload");
    return { hash, validUntil, entry: entry.toXDR("base64"), contractId, method, args: args.map((a) => a.toXDR("base64")) };
  }

  // Attach her signature (hex, 64 bytes) and submit. The SDK verifies the signature against her
  // address before anything is sent.
  async function completeGuardianCall(pending, guardianAddress, signatureHex) {
    const signature = Buffer.from(String(signatureHex).replace(/^0x/, ""), "hex");
    if (signature.length !== 64) throw new Error("the signature must be 64 bytes");
    const entry = xdr.SorobanAuthorizationEntry.fromXDR(pending.entry, "base64");
    const signed = await authorizeEntry(entry, async (_preimage, payload) => {
      if (Buffer.from(payload).toString("hex") !== pending.hash) throw new Error("the signed request does not match");
      return { signature, publicKey: guardianAddress };
    }, pending.validUntil, passphrase);
    const args = pending.args.map((a) => xdr.ScVal.fromXDR(a, "base64"));
    const op = Operation.invokeHostFunction({
      func: xdr.HostFunction.hostFunctionTypeInvokeContract(new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(pending.contractId).toScAddress(),
        functionName: pending.method,
        args,
      })),
      auth: [signed],
    });
    return asOperator(async () => {
      const account = await server.getAccount(agent.publicKey());
      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase }).addOperation(op).setTimeout(60).build();
      const prepared = await server.prepareTransaction(tx);
      prepared.sign(agent);
      return soroban.submit(prepared);
    });
  }

  // Sign-up step 1: deploy her family's purse and prepare `configure` for her signature.
  // `agentAddress`: the family's own agent wallet, already created (createAgentWallet).
  async function prepareSetup({ guardianAddress, limits, destinations, agentAddress }) {
    if (!/^G[A-Z2-7]{55}$/.test(guardianAddress ?? "")) throw new Error("not a Stellar address");
    if (!/^G[A-Z2-7]{55}$/.test(agentAddress ?? "")) throw new Error("the family's agent wallet is missing");
    await ensureAccount(guardianAddress);
    const { contractId, tx } = await deployPurse(guardianAddress, agentAddress);
    const purseCap = capBaseUnits(monthlyCap(limits), capRate(config), 100, config.usdc.decimals, config.serviceFeeBps);
    const pending = await prepareGuardianCall({
      contractId,
      guardianAddress,
      method: "configure",
      args: [capsMap(limits, config), destsMap(destinations, contractId, config), i128(purseCap)],
    });
    return { ...pending, deployTx: tx };
  }

  // A new plan for an existing purse: `configure` again with the new caps and monthly cap, the
  // same saved destinations, for her signature. The contract checks the caps again.
  async function prepareLimits({ contractId, guardianAddress, limits, destinations }) {
    const purseCap = capBaseUnits(monthlyCap(limits), capRate(config), 100, config.usdc.decimals, config.serviceFeeBps);
    return prepareGuardianCall({
      contractId,
      guardianAddress,
      method: "configure",
      args: [capsMap(limits, config), destsMap(destinations, contractId, config), i128(purseCap)],
    });
  }

  // Test USDC for the demo: sent from the treasury wallet straight into the purse contract.
  async function sendTestUsdc(contractId, usdc) {
    if (!config.treasurySecret) throw new Error("no treasury wallet configured (TREASURY_SECRET)");
    const treasury = Keypair.fromSecret(config.treasurySecret);
    const amount = BigInt(Math.round(usdc * 10 ** config.usdc.decimals));
    const { hash } = await soroban.invoke(treasury, config.usdc.contractId, "transfer", [addressVal(treasury.publicKey()), addressVal(contractId), i128(amount)]);
    return { tx: hash, amount: String(amount) };
  }

  // A Stellar wallet must opt in to USDC once (a trustline) before it can receive it. Her Privy
  // wallet hasn't, so the first withdrawal to it asks for one extra signature: a classic
  // changeTrust transaction from her own account (testnet XLM from Friendbot pays its tiny fee).
  async function hasUsdcTrustline(address) {
    const res = await fetchImpl(`${config.horizonUrl}/accounts/${address}`);
    if (res.status === 404) return false;
    // Any other failure is not a "no": stop, rather than ask her for an opt-in she may not need.
    if (!res.ok) throw new Error(`Stellar didn’t answer (HTTP ${res.status}). Please try again.`);
    const account = await res.json();
    return (account.balances ?? []).some((b) => b.asset_code === "USDC" && b.asset_issuer === config.usdc.issuer);
  }

  async function prepareTrustline(address) {
    await ensureAccount(address);
    const account = await server.getAccount(address);
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
      .addOperation(Operation.changeTrust({ asset: new Asset("USDC", config.usdc.issuer) }))
      .setTimeout(600)
      .build();
    return { kind: "trustline", hash: tx.hash().toString("hex"), xdr: tx.toXDR() };
  }

  async function completeTrustline(pending, address, signatureHex) {
    const signature = Buffer.from(String(signatureHex).replace(/^0x/, ""), "hex");
    if (signature.length !== 64) throw new Error("the signature must be 64 bytes");
    const tx = TransactionBuilder.fromXDR(pending.xdr, passphrase);
    if (tx.hash().toString("hex") !== pending.hash) throw new Error("the signed request does not match");
    if (!Keypair.fromPublicKey(address).verify(tx.hash(), signature)) throw new Error("signature does not match");
    tx.addSignature(address, signature.toString("base64"));
    return soroban.submit(tx);
  }

  // The purse sends USDC back out (guardian only, her signature).
  async function prepareWithdraw({ contractId, guardianAddress, to, usdc }) {
    const amount = BigInt(Math.round(usdc * 10 ** config.usdc.decimals));
    return prepareGuardianCall({ contractId, guardianAddress, method: "withdraw", args: [addressVal(to), i128(amount)] });
  }

  async function purseBalance(contractId) {
    const raw = await soroban.read(config.usdc.contractId, "balance", [addressVal(contractId)], agent.publicKey());
    return Number(raw) / 10 ** config.usdc.decimals;
  }

  // Are the purse's on-chain caps below what her plan costs at today's rate? Caps are saved in USDC
  // with a margin (capRate); if the naira strengthens past it, a top-up her plan allows would be
  // refused by the contract. The dashboard then asks her to re-save the plan (one signature).
  async function capsBehind({ contractId, limits }) {
    const d = config.usdc.decimals;
    const fee = config.serviceFeeBps;
    const keys = { per_topup: "perTopup", per_day: "perDay", per_week: "perWeek", per_month: "perMonth" };
    for (const u of UTILITIES.filter((x) => limits[x])) {
      const onChain = await soroban.read(contractId, "caps", [symbol(u)], agent.publicKey());
      if (!onChain) return true;
      for (const [k, field] of Object.entries(keys)) {
        const ngn = limits[u][field];
        if (ngn && BigInt(onChain[k] ?? 0) < capBaseUnits(ngn, config.ngnPerUsdc, MIN_TOPUP[u], d, fee)) return true;
      }
    }
    const purseCap = await soroban.read(contractId, "purse_cap", [], agent.publicKey());
    return BigInt(purseCap ?? 0) < capBaseUnits(monthlyCap(limits), config.ngnPerUsdc, 100, d, fee);
  }

  return { capsBehind, closeAgentWallet, createAgentWallet, latestLedger, prepareSetAgent, topUpAgentXlm, prepareSetup, prepareLimits, prepareWithdraw, hasUsdcTrustline, prepareTrustline, completeTrustline, prepareGuardianCall, completeGuardianCall, sendTestUsdc, purseBalance, ensureAccount };
}

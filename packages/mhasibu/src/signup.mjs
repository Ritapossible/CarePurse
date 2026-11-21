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
import { Address, Contract, Keypair, Networks, Operation, TransactionBuilder, BASE_FEE, authorizeEntry, rpc, xdr } from "@stellar/stellar-sdk";
import { MIN_TOPUP, monthlyCap } from "./limits.mjs";
import { addressVal, bytes32, capBaseUnits, createSoroban, destHash, i128, symbol } from "./purse-contract.mjs";

const UTILITIES = ["electricity", "airtime", "data"];
const AUTH_LEDGERS = 120; // the signature request stays valid ~10 minutes

// Caps in USDC base units, from the naira limits (the same conversion as the demo purse).
function capsMap(limits, config) {
  const entries = UTILITIES.filter((u) => limits[u]).map((u) => {
    const l = limits[u];
    const caps = xdr.ScVal.scvMap(
      [["per_day", l.perDay], ["per_month", l.perMonth], ["per_topup", l.perTopup], ["per_week", l.perWeek]].map(
        ([k, v]) => new xdr.ScMapEntry({ key: symbol(k), val: i128(capBaseUnits(v ?? 0, config.ngnPerUsdc, MIN_TOPUP[u], config.usdc.decimals, config.serviceFeeBps)) }),
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

  async function deployPurse(guardianAddress) {
    if (!config.purseWasmHash) throw new Error("PURSE_WASM_HASH is not set: run npm run install-wasm");
    const created = await soroban.send(agent, Operation.createCustomContract({
      address: Address.fromString(agent.publicKey()),
      wasmHash: Buffer.from(config.purseWasmHash, "hex"),
      salt: crypto.randomBytes(32),
      constructorArgs: [addressVal(guardianAddress), addressVal(agent.publicKey()), addressVal(config.usdc.contractId)],
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
    const account = await server.getAccount(agent.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase }).addOperation(op).setTimeout(60).build();
    const prepared = await server.prepareTransaction(tx);
    prepared.sign(agent);
    return soroban.submit(prepared);
  }

  // Sign-up step 1: deploy her family's purse and prepare `configure` for her signature.
  async function prepareSetup({ guardianAddress, limits, destinations }) {
    if (!/^G[A-Z2-7]{55}$/.test(guardianAddress ?? "")) throw new Error("not a Stellar address");
    await ensureAccount(guardianAddress);
    const { contractId, tx } = await deployPurse(guardianAddress);
    const purseCap = capBaseUnits(monthlyCap(limits), config.ngnPerUsdc, 100, config.usdc.decimals, config.serviceFeeBps);
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
    const purseCap = capBaseUnits(monthlyCap(limits), config.ngnPerUsdc, 100, config.usdc.decimals, config.serviceFeeBps);
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

  async function purseBalance(contractId) {
    const raw = await soroban.read(config.usdc.contractId, "balance", [addressVal(contractId)], agent.publicKey());
    return Number(raw) / 10 ** config.usdc.decimals;
  }

  return { prepareSetup, prepareLimits, prepareGuardianCall, completeGuardianCall, sendTestUsdc, purseBalance, ensureAccount };
}

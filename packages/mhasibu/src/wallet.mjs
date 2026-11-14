// Mhasibu's wallet: talks to the gateway and pays over x402 on Stellar testnet.
// It never signs without the rule checks, and the x402 client itself refuses any offer
// that doesn't match the order exactly (the kit's Layer 2).
import { Keypair, Horizon } from "@stellar/stellar-sdk";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { config as defaultConfig } from "./config.mjs";
import { addressVal, buyArgs, createSoroban, i128, orderRef, refArgs } from "./purse-contract.mjs";

export function createWallet(config = defaultConfig) {
  const json = async (res) => { const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`); return body; };

  return {
    expected: { host: config.allowedHost, payTo: config.gatewayRecipient, asset: config.usdc.contractId, network: config.network },

    // The purse balance in naira at the demo rate. Phase 2: the purse contract's USDC plus any USDC
    // still on the agent wallet (an unsettled top-up), so the family's money never "disappears".
    // New purchases are blocked while a top-up is unsettled, so this never offers money twice.
    // Phase 1: the agent wallet's USDC, because that wallet IS the purse.
    async balanceNgn() {
      const address = Keypair.fromSecret(config.agentSecret).publicKey();
      if (config.purseContractId) {
        const soroban = createSoroban({ rpcUrl: config.rpcUrl });
        const [inPurse, onAgent] = await Promise.all([
          soroban.read(config.usdc.contractId, "balance", [addressVal(config.purseContractId)], address),
          soroban.read(config.usdc.contractId, "balance", [addressVal(address)], address).catch(() => 0n),
        ]);
        return (Number(BigInt(inPurse) + BigInt(onAgent)) / 10 ** config.usdc.decimals) * config.ngnPerUsdc;
      }
      const account = await new Horizon.Server(config.horizonUrl).loadAccount(address);
      const usdc = account.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === config.usdc.issuer);
      return Number(usdc?.balance ?? 0) * config.ngnPerUsdc;
    },

    async options(utility, maxNgn, network) {
      const url = new URL("/v1/options", config.gatewayUrl);
      url.searchParams.set("utility", utility);
      if (network) url.searchParams.set("network", network);
      url.searchParams.set("max_ngn", String(Math.max(1, maxNgn)));
      return (await json(await fetch(url))).options;
    },

    async createOrder({ utility, ngn, destination, network, disco, contactPhone }) {
      const res = await fetch(new URL("/v1/orders", config.gatewayUrl), {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ utility, ngn, destination, network, disco, contactPhone }),
      });
      return json(res);
    },

    // Ask without paying, and read the 402's offer for our network.
    async quote(payPath) {
      const url = new URL(payPath, config.gatewayUrl);
      const res = await fetch(url);
      if (res.status !== 402) throw new Error(`expected 402, got HTTP ${res.status}`);
      const header = res.headers.get("payment-required");
      const offer = header && decodePaymentRequiredHeader(header).accepts.find((a) => a.network === config.network);
      if (!offer) throw new Error("the gateway offered no payment on our network");
      return { url: url.href, host: url.host, amount: offer.amount, payTo: offer.payTo, asset: offer.asset, network: offer.network };
    },

    // Phase 2: ask the purse contract for exactly this top-up. It checks the guardian's caps and
    // saved destination on-chain, then sends the amount to the agent wallet. Throws
    // ContractRefused when the contract says no. Phase 1 (no contract): not defined.
    release: !config.purseContractId ? undefined : async ({ utility, destination, amount, orderId }) => {
      const soroban = createSoroban({ rpcUrl: config.rpcUrl });
      const { hash } = await soroban.invoke(Keypair.fromSecret(config.agentSecret), config.purseContractId, "buy", buyArgs({ utility, destination, amount, orderId }));
      return { tx: hash, contractId: config.purseContractId };
    },

    // Phase 2 settlement calls. They take the on-chain reference (sha256 of the order id, hex), so an
    // open order can be settled even if Mhasibu lost the id: the contract only stores the hash.
    refundRef: !config.purseContractId ? undefined : async (ref) => {
      const { hash } = await createSoroban({ rpcUrl: config.rpcUrl }).invoke(Keypair.fromSecret(config.agentSecret), config.purseContractId, "refund", refArgs(ref));
      return { tx: hash };
    },
    commitRef: !config.purseContractId ? undefined : async (ref) => {
      const { hash } = await createSoroban({ rpcUrl: config.rpcUrl }).invoke(Keypair.fromSecret(config.agentSecret), config.purseContractId, "commit", refArgs(ref));
      return { tx: hash };
    },

    // The contract's open order reference (hex), or null. Throws if the chain can't be read.
    async openOrderRef() {
      const open = await createSoroban({ rpcUrl: config.rpcUrl }).read(config.purseContractId, "open_order", [], Keypair.fromSecret(config.agentSecret).publicKey());
      return open ? Buffer.from(open).toString("hex") : null;
    },

    // What the contract recorded for an order: utility and amount (base units).
    async contractOrder(ref) {
      const rec = await createSoroban({ rpcUrl: config.rpcUrl }).read(config.purseContractId, "order", refArgs(ref), Keypair.fromSecret(config.agentSecret).publicKey());
      return rec ? { utility: String(rec.utility), amount: String(rec.amount), refunded: rec.refunded, committed: rec.committed } : null;
    },

    // The gateway's record of an order: status, and the token if one was delivered or issued.
    async orderStatus(orderId) {
      const res = await fetch(new URL(`/v1/orders/${orderId}`, config.gatewayUrl));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`order lookup HTTP ${res.status}`);
      return (await res.json()).order;
    },
    async orderByRef(ref) {
      const res = await fetch(new URL(`/v1/orders/by-ref/${ref}`, config.gatewayUrl));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`order lookup HTTP ${res.status}`);
      return (await res.json()).order;
    },

    // Recovery only: the provider issued the token but the x402 settlement failed, so the USDC is
    // still on Mhasibu's wallet. Pay the gateway's allowlisted address that exact amount directly.
    // Every normal top-up is paid over x402.
    payGatewayDirect: !config.purseContractId ? undefined : async (amount) => {
      const agent = Keypair.fromSecret(config.agentSecret);
      const { hash } = await createSoroban({ rpcUrl: config.rpcUrl }).invoke(agent, config.usdc.contractId, "transfer",
        [addressVal(agent.publicKey()), addressVal(config.gatewayRecipient), i128(amount)]);
      return { tx: hash };
    },

    // Pay exactly the approved offer. Anything else is filtered out before signing.
    async pay(url, approved) {
      const signer = createEd25519Signer(config.agentSecret, config.network);
      const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
        schemes: [{ network: config.network, client: new ExactStellarScheme(signer, { url: config.rpcUrl }) }],
        policies: [(_version, offers) => offers.filter((o) =>
          o.amount === approved.amount && o.payTo === approved.payTo && o.asset === approved.asset && o.network === approved.network)],
      });
      const res = await paidFetch(url);
      const header = res.headers.get("payment-response");
      const settlement = header ? decodePaymentResponseHeader(header) : null;
      if (!res.ok || !settlement?.success) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(`payment not confirmed (HTTP ${res.status})`);
        err.retryLater = Boolean(body.retryLater);
        throw err;
      }
      return { result: await res.json(), tx: settlement.transaction };
    },
  };
}

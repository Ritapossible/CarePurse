// Mhasibu's wallet: talks to the gateway and pays over x402 on Stellar testnet.
// It never signs without the rule checks, and the x402 client itself refuses any offer
// that doesn't match the order exactly (the kit's Layer 2).
import { Keypair, Horizon } from "@stellar/stellar-sdk";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { config as defaultConfig } from "./config.mjs";

export function createWallet(config = defaultConfig) {
  const json = async (res) => { const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`); return body; };

  return {
    expected: { host: config.allowedHost, payTo: config.gatewayRecipient, asset: config.usdc.contractId, network: config.network },

    // The agent wallet's USDC balance, in naira at the demo rate. In Phase 1 this wallet IS the purse.
    async balanceNgn() {
      const address = Keypair.fromSecret(config.agentSecret).publicKey();
      const account = await new Horizon.Server(config.horizonUrl).loadAccount(address);
      const usdc = account.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === config.usdc.issuer);
      return Number(usdc?.balance ?? 0) * config.ngnPerUsdc;
    },

    async options(utility, maxNgn) {
      const url = new URL("/v1/options", config.gatewayUrl);
      url.searchParams.set("utility", utility);
      url.searchParams.set("max_ngn", String(Math.max(1, maxNgn)));
      return (await json(await fetch(url))).options;
    },

    async createOrder({ utility, ngn, destination }) {
      const res = await fetch(new URL("/v1/orders", config.gatewayUrl), {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ utility, ngn, destination }),
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
      if (!res.ok || !settlement?.success) throw new Error(`payment not confirmed (HTTP ${res.status})`);
      return { result: await res.json(), tx: settlement.transaction };
    },
  };
}

// Plays Mhasibu's part: creates an order and pays for it over x402 on Stellar testnet.
// Usage: npm run pay [utility] [ngn] [destination]
//   npm run pay                          → electricity ₦5,000 to a sandbox meter
//   npm run pay airtime 100 08031234567  → ₦100 airtime
import { Keypair } from "@stellar/stellar-sdk";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { config, explorer } from "../src/config.mjs";

const [utility = "electricity", ngn = "5000", destination = utility === "electricity" ? "45012345678" : "08031234567"] = process.argv.slice(2);

let agent;
try { agent = Keypair.fromSecret(config.agentSecret); }
catch { console.error("AGENT_SECRET_KEY missing or invalid. Run: npm run setup"); process.exit(1); }

// 1. Order (free)
const created = await fetch(`${config.gatewayUrl}/v1/orders`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ utility, ngn: Number(ngn), destination }),
});
const { order, payPath, error } = await created.json();
if (!created.ok) { console.error(`✗ ${error}`); process.exit(1); }
console.log(`Order ${order.id}: ${utility} ₦${ngn} for ${destination} · ${Number(order.amount) / 10 ** config.usdc.decimals} USDC`);

// 2. Pay: 402 → sign the USDC transfer → retry, all inside paidFetch
const signer = createEd25519Signer(config.agentSecret, config.network);
const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: config.network, client: new ExactStellarScheme(signer, { url: config.rpcUrl }) }],
});
console.log(`Agent ${agent.publicKey().slice(0, 6)}… paying ${config.gatewayUrl}${payPath}`);
const started = Date.now();
const res = await paidFetch(`${config.gatewayUrl}${payPath}`);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (!res.ok) { console.error(`\n✗ HTTP ${res.status}: ${await res.text()}`); process.exit(1); }
const result = await res.json();
console.log(`\n✓ Paid and delivered in ${seconds}s`);
if (result.token) console.log(`  Token: ${result.token}  (${result.units})`);
else console.log(`  ${result.note}`);
console.log(`  ${result.label}`);

const header = res.headers.get("payment-response");
if (header) {
  const settlement = decodePaymentResponseHeader(header);
  console.log(`  Settlement: ${settlement.success ? "success" : "failed"} on ${settlement.network}`);
  console.log(`  Transaction: ${explorer.tx(settlement.transaction)}`);
}

// Shows what a 402 from the gateway looks like, without paying.
// Usage: npm run peek [utility] [ngn] [destination]
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { config } from "../src/config.mjs";

const [utility = "electricity", ngn = "5000", destination = utility === "electricity" ? "45012345678" : "08031234567"] = process.argv.slice(2);

const created = await fetch(`${config.gatewayUrl}/v1/orders`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ utility, ngn: Number(ngn), destination }),
});
const body = await created.json();
if (!created.ok) { console.error(`✗ ${body.error}`); process.exit(1); }

const res = await fetch(`${config.gatewayUrl}${body.payPath}`);
console.log(`GET ${body.payPath}\n→ HTTP ${res.status}`);
const header = res.headers.get("payment-required");
if (!header) { console.log(await res.text()); process.exit(res.status === 402 ? 0 : 1); }

const { accepts } = decodePaymentRequiredHeader(header);
const a = accepts[0];
console.log(`\nIn plain English: pay ${Number(a.amount) / 10 ** config.usdc.decimals} USDC (${a.amount} base units)`);
console.log(`  on ${a.network}, asset ${a.asset}`);
console.log(`  to ${a.payTo}, within ${a.maxTimeoutSeconds}s`);
console.log(`\nThat buys: ${utility} ₦${ngn} for ${destination}. Nothing was paid.`);

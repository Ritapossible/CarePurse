// Calls the VTpass SANDBOX directly through our provider: verify the test meter, then buy
// electricity, airtime and data with the sandbox's test numbers. No Stellar payment involved.
// Needs VTPASS_API_KEY, VTPASS_SECRET_KEY, VTPASS_PUBLIC_KEY. Prints results, never keys.
//   npm run vtpass-check
import { config } from "../src/config.mjs";
import { createVtpassProvider } from "../src/provider.mjs";

const provider = createVtpassProvider(config.vtpass);
const METER = "1111111111111";
const PHONE = "08011111111";
let failures = 0;
const show = (label, r) => {
  if (!r.ok) failures++;
  const { ok, ...rest } = r;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(rest)}`);
};

// CHECKS=electricity,airtime,data (default all). VTpass refuses a second purchase to the same
// number within a few minutes ("019 LIKELY DUPLICATE TRANSACTION"), so retest one at a time.
// If VTpass answers 019 anyway (two checks to the one sandbox test number close together), wait out
// its window once and try again, so a passing provider isn't reported as broken.
const GUARD_MS = Number(process.env.VTPASS_GUARD_WAIT_MS ?? 330_000);
async function buy(order) {
  const first = await provider.purchase(order);
  if (first.ok || !first.retryLater) return first;
  console.log(`  VTpass duplicate guard (019) on ${order.utility}: waiting ${Math.round(GUARD_MS / 60000)} min, then one retry`);
  await new Promise((r) => setTimeout(r, GUARD_MS));
  return provider.purchase(order);
}
const only = new Set((process.env.CHECKS || "electricity,airtime,data").split(",").map((s) => s.trim()));
const bal = await provider.balance();
console.log(`  sandbox wallet: ${JSON.stringify(bal)}`);
show("verify meter", await provider.lookupMeter(METER));
if (only.has("electricity")) show("electricity ₦500", await buy({ utility: "electricity", ngn: 500, destination: METER, contactPhone: PHONE }));
if (only.has("airtime")) show("airtime ₦100 (MTN)", await buy({ utility: "airtime", ngn: 100, destination: PHONE, network: "mtn" }));
if (only.has("data")) {
  // Only sizes MTN sells at exactly that price are offered; show which, then buy one.
  const sold = await provider.dataTiers("mtn");
  const tiers = [100, 200, 500, 1000, 2000, 5000].filter((t) => sold.has(t));
  console.log(`  MTN data sizes we can offer: ${tiers.map((t) => `₦${t}`).join(", ") || "none"}`);
  const ngn = tiers.includes(200) ? 200 : tiers[0];
  show(`data ₦${ngn} (MTN)`, await buy({ utility: "data", ngn, destination: PHONE, network: "mtn" }));
}
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll VTpass sandbox checks passed.");
process.exit(failures ? 1 : 0);

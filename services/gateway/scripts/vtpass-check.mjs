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
const only = new Set((process.env.CHECKS || "electricity,airtime,data").split(",").map((s) => s.trim()));
const bal = await provider.balance();
console.log(`  sandbox wallet: ${JSON.stringify(bal)}`);
show("verify meter", await provider.lookupMeter(METER));
if (only.has("electricity")) show("electricity ₦500", await provider.purchase({ utility: "electricity", ngn: 500, destination: METER, contactPhone: PHONE }));
if (only.has("airtime")) show("airtime ₦100 (MTN)", await provider.purchase({ utility: "airtime", ngn: 100, destination: PHONE, network: "mtn" }));
if (only.has("data")) {
  // Only sizes MTN sells at exactly that price are offered; show which, then buy one.
  const sold = await provider.dataTiers("mtn");
  const tiers = [100, 200, 500, 1000, 2000, 5000].filter((t) => sold.has(t));
  console.log(`  MTN data sizes we can offer: ${tiers.map((t) => `₦${t}`).join(", ") || "none"}`);
  const ngn = tiers.includes(200) ? 200 : tiers[0];
  show(`data ₦${ngn} (MTN)`, await provider.purchase({ utility: "data", ngn, destination: PHONE, network: "mtn" }));
}
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll VTpass sandbox checks passed.");
process.exit(failures ? 1 : 0);

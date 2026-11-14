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

show("verify meter", await provider.lookupMeter(METER));
show("electricity ₦500", await provider.purchase({ utility: "electricity", ngn: 500, destination: METER, contactPhone: PHONE }));
show("airtime ₦100 (MTN)", await provider.purchase({ utility: "airtime", ngn: 100, destination: PHONE, network: "mtn" }));
show("data ₦500 (MTN)", await provider.purchase({ utility: "data", ngn: 500, destination: PHONE, network: "mtn" }));
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll VTpass sandbox checks passed.");
process.exit(failures ? 1 : 0);

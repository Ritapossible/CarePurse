// The utility provider: who actually issues the electricity token or the airtime/data top-up.
// For the hackathon this is a SANDBOX: it returns demo tokens and never touches a real meter
// or phone. A real biller (VTpass sandbox, then a live aggregator) plugs in behind the same two functions.
import crypto from "node:crypto";

const digits = (n) => Array.from(crypto.randomBytes(n), (b) => b % 10).join("");
const groups = (s) => s.match(/.{1,4}/g).join(" ");

export function createMockProvider() {
  return {
    name: "mock sandbox",

    // Who owns this meter? Lets the daughter confirm it's Mama's before saving it.
    async lookupMeter(meter) {
      if (!/^\d{11,13}$/.test(meter)) return { ok: false, reason: "A meter number has 11 to 13 digits." };
      return { ok: true, meter, ownerName: "SANDBOX CUSTOMER", disco: "IKEDC prepaid (sandbox)" };
    },

    async purchase({ utility, ngn, destination }) {
      if (utility === "electricity") {
        return { ok: true, token: groups(digits(20)), units: `${(ngn / 225).toFixed(1)} kWh (demo)`, reference: `SBX-${digits(10)}` };
      }
      return { ok: true, reference: `SBX-${digits(10)}`, note: `₦${ngn} ${utility} sent to ${destination} (sandbox)` };
    },
  };
}

export function createProvider(name) {
  if (name === "mock") return createMockProvider();
  throw new Error(`UTILITY_PROVIDER=${name} is not built yet. Use mock.`);
}

// What the gateway sells, and what each top-up size costs in USDC.
// Electricity starts at ₦500. Airtime and data start at ₦100 (see MEMORY.md).

export const UTILITIES = {
  electricity: { label: "Electricity", destination: "meter", tiers: [500, 1000, 2000, 5000, 10000] },
  airtime: { label: "Airtime", destination: "phone", tiers: [100, 200, 500, 1000, 2000, 5000] },
  data: { label: "Data", destination: "phone", tiers: [100, 200, 500, 1000, 2000, 5000] },
};

export const isUtility = (name) => Object.hasOwn(UTILITIES, name);
export const isTier = (utility, ngn) => isUtility(utility) && UTILITIES[utility].tiers.includes(ngn);

// Exact price in USDC base units (USDC has 7 decimals on Stellar), as a string for x402.
// Integer maths only, rounded up to the nearest base unit so the gateway is never short.
export function priceBaseUnits(ngn, ngnPerUsdc, decimals = 7) {
  const scale = 10n ** BigInt(decimals);
  const rateMilli = BigInt(Math.round(ngnPerUsdc * 1000));
  const numerator = BigInt(ngn) * scale * 1000n;
  return ((numerator + rateMilli - 1n) / rateMilli).toString();
}

// "3.4013605" → "3.40" for people to read. Never used for payment.
export function toDisplayUsdc(baseUnits, decimals = 7) {
  return (Number(baseUnits) / 10 ** decimals).toFixed(2);
}

// The tiers for one utility, optionally only those at or below maxNgn.
export function options(utility, { ngnPerUsdc, decimals = 7, maxNgn } = {}) {
  if (!isUtility(utility)) return [];
  return UTILITIES[utility].tiers
    .filter((ngn) => maxNgn === undefined || ngn <= maxNgn)
    .map((ngn) => {
      const amount = priceBaseUnits(ngn, ngnPerUsdc, decimals);
      return { utility, ngn, amount, usdc: toDisplayUsdc(amount, decimals), path: `/paid/topup/${utility}/${ngn}` };
    });
}

// Every paid route, for the x402 middleware: "GET /topup/electricity/500" → price.
export function paidRoutes({ ngnPerUsdc, decimals, asset, network, payTo }) {
  const routes = {};
  for (const [utility, { label, tiers }] of Object.entries(UTILITIES)) {
    for (const ngn of tiers) {
      routes[`GET /topup/${utility}/${ngn}`] = {
        accepts: { scheme: "exact", price: { amount: priceBaseUnits(ngn, ngnPerUsdc, decimals), asset }, network, payTo },
        description: `${label} top-up, ₦${ngn.toLocaleString("en-NG")} (sandbox fulfilment)`,
        mimeType: "application/json",
      };
    }
  }
  return routes;
}

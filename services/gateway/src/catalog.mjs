// What the gateway sells, and what each top-up size costs in USDC.
// Electricity starts at ₦500. Airtime and data start at ₦100 (see MEMORY.md).

export const UTILITIES = {
  electricity: { label: "Electricity", destination: "meter", tiers: [500, 1000, 2000, 5000, 10000] },
  airtime: { label: "Airtime", destination: "phone", tiers: [100, 200, 500, 1000, 2000, 5000] },
  // Data: every price a network may sell a bundle at; /v1/options shows only those the chosen
  // network really sells (VTpass bundle list), with what each one gives.
  data: { label: "Data", destination: "phone", tiers: [100, 200, 500, 600, 800, 1000, 1500, 2000, 2500, 3000, 5000] },
};

export const isUtility = (name) => Object.hasOwn(UTILITIES, name);
export const isTier = (utility, ngn) => isUtility(utility) && UTILITIES[utility].tiers.includes(ngn);

// CarePurse's service fee, in basis points (300 = 3%), added on top of the face value. Mama gets the
// full face value; the purse (Adaeze's money) pays face value + fee. Like Ponte's 3% markup.
export const feeNgn = (ngn, feeBps = 0) => (ngn * feeBps) / 10_000;
export const chargedNgn = (ngn, feeBps = 0) => ngn + feeNgn(ngn, feeBps);

// Exact price in USDC base units (USDC has 7 decimals on Stellar), as a string for x402: the face
// value plus the service fee. Integer maths only, rounded up so the gateway is never short.
export function priceBaseUnits(ngn, ngnPerUsdc, decimals = 7, feeBps = 0) {
  const scale = 10n ** BigInt(decimals);
  const rateMilli = BigInt(Math.round(ngnPerUsdc * 1000));
  const numerator = BigInt(ngn) * BigInt(10_000 + feeBps) * scale * 1000n;
  const denominator = rateMilli * 10_000n;
  return ((numerator + denominator - 1n) / denominator).toString();
}

// "3.4013605" → "3.40" for people to read. Never used for payment.
export function toDisplayUsdc(baseUnits, decimals = 7) {
  return (Number(baseUnits) / 10 ** decimals).toFixed(2);
}

// The tiers for one utility, optionally only those at or below maxNgn.
// ngn is the face value (what Mama gets); amount/chargedNgn include the service fee.
export function options(utility, { ngnPerUsdc, decimals = 7, maxNgn, feeBps = 0 } = {}) {
  if (!isUtility(utility)) return [];
  return UTILITIES[utility].tiers
    .filter((ngn) => maxNgn === undefined || ngn <= maxNgn)
    .map((ngn) => {
      const amount = priceBaseUnits(ngn, ngnPerUsdc, decimals, feeBps);
      return { utility, ngn, feeNgn: feeNgn(ngn, feeBps), chargedNgn: chargedNgn(ngn, feeBps), amount, usdc: toDisplayUsdc(amount, decimals), path: `/paid/topup/${utility}/${ngn}` };
    });
}

export const PAY_WINDOW_SECONDS = 60;

// Every paid route, for the x402 middleware: "GET /topup/electricity/500" → price.
// priceFor (optional): the price of one request, e.g. the amount quoted on its order, so a rate
// refresh never changes what an existing order pays. Without it, the price is fixed at ngnPerUsdc.
export function paidRoutes({ ngnPerUsdc, decimals, asset, network, payTo, feeBps = 0, priceFor }) {
  const routes = {};
  for (const [utility, { label, tiers }] of Object.entries(UTILITIES)) {
    for (const ngn of tiers) {
      routes[`GET /topup/${utility}/${ngn}`] = {
        // A signed payment stays valid only this long (x402 sets its expiry ledger from it). Signing and
        // the retry take about 10 s; a short window means a payment Mhasibu gave up on can't be settled later.
        accepts: { scheme: "exact", price: priceFor ? (ctx) => ({ amount: priceFor(ctx, utility, ngn), asset }) : { amount: priceBaseUnits(ngn, ngnPerUsdc, decimals, feeBps), asset }, network, payTo, maxTimeoutSeconds: PAY_WINDOW_SECONDS },
        description: `${label} top-up, ₦${ngn.toLocaleString("en-NG")}${feeBps ? ` + ₦${feeNgn(ngn, feeBps).toLocaleString("en-NG")} service fee` : ""} (sandbox fulfilment)`,
        mimeType: "application/json",
      };
    }
  }
  return routes;
}

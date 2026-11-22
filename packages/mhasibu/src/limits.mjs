// The daughter's spending limits, in naira, and the rules Mhasibu runs before it signs anything.
// All periods use Lagos time (West Africa Time, UTC+1, no daylight saving).

export const PRESETS = {
  light: {
    electricity: { perTopup: 2000, perWeek: 5000 },
    airtime: { perTopup: 200, perDay: 500 },
    data: { perTopup: 200, perDay: 500 },
  },
  standard: {
    electricity: { perTopup: 5000, perWeek: 15000 },
    airtime: { perTopup: 500, perDay: 1000 },
    data: { perTopup: 1000, perDay: 1000 }, // ₦1,000: MTN's 1.5GB for 30 days (it has no ₦500 bundle)
  },
};

// The whole-purse monthly cap is calculated, never typed: electricity per week × 4,
// plus airtime and data per day × 30. Light = ₦50,000, Standard = ₦120,000.
export function monthlyCap(limits) {
  const weekly = (u) => (u.perWeek ?? 0) * 4;
  const daily = (u) => (u.perDay ?? 0) * 30;
  return Object.values(limits).reduce((sum, u) => sum + weekly(u) + daily(u) + (u.perMonth ?? 0), 0);
}

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Start of the current day / week (Monday) / month, in Lagos time, as a UTC timestamp.
export function periodStart(period, now = Date.now()) {
  const lagos = new Date(now + LAGOS_OFFSET_MS);
  const midnight = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()) - LAGOS_OFFSET_MS;
  if (period === "day") return midnight;
  if (period === "week") return midnight - ((lagos.getUTCDay() + 6) % 7) * DAY_MS;
  if (period === "month") return Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), 1) - LAGOS_OFFSET_MS;
  throw new Error(`unknown period ${period}`);
}

export function spentSince(spends, since, utility) {
  return spends
    .filter((s) => Date.parse(s.at) >= since && (utility === undefined || s.utility === utility))
    .reduce((sum, s) => sum + s.ngn, 0);
}

// How much more Mama may spend on this utility right now, and which rule is tightest.
// Limits are in face value (what Mama gets). The purse pays face value + the service fee, so the
// balance rule asks how much face value the balance can cover once the fee is added.
export function headroom(purse, utility, { balanceNgn, now = Date.now(), feeBps = 0 }) {
  const limits = purse.limits[utility];
  const checks = [];
  if (limits.perTopup !== undefined) checks.push({ rule: "per top-up", left: limits.perTopup });
  if (limits.perDay !== undefined) checks.push({ rule: "per day", left: limits.perDay - spentSince(purse.spends, periodStart("day", now), utility), period: "day" });
  if (limits.perWeek !== undefined) checks.push({ rule: "per week", left: limits.perWeek - spentSince(purse.spends, periodStart("week", now), utility), period: "week" });
  if (limits.perMonth !== undefined) checks.push({ rule: "per month", left: limits.perMonth - spentSince(purse.spends, periodStart("month", now), utility), period: "month" });
  checks.push({ rule: "purse per month", left: purse.monthlyCap - spentSince(purse.spends, periodStart("month", now)), period: "month" });
  checks.push({ rule: "purse balance", left: Math.floor((balanceNgn * 10_000) / (10_000 + feeBps)) });
  const tightest = checks.reduce((a, b) => (b.left < a.left ? b : a));
  return { maxNgn: Math.max(0, tightest.left), tightest };
}

// The longest time a signed x402 payment may stay valid (the gateway asks for 60 s).
export const MAX_PAY_WINDOW_SECONDS = 120;

// The rules, in order. The first "no" wins. Returns { ok: true } or { ok: false, rule, reason }.
export function checkPurchase({ purse, utility, ngn, destination, quote, order, expected, balanceNgn, now = Date.now(), feeBps = 0 }) {
  if (quote) {
    // 1. Allowlist: right host, right payee, testnet USDC, testnet.
    if (quote.host !== expected.host) return { ok: false, rule: "allowlist", reason: `${quote.host} is not our gateway` };
    if (quote.payTo !== expected.payTo) return { ok: false, rule: "allowlist", reason: "the payment would go to an unknown wallet" };
    if (quote.asset !== expected.asset) return { ok: false, rule: "allowlist", reason: "not testnet USDC" };
    if (quote.network !== expected.network) return { ok: false, rule: "allowlist", reason: `wrong network ${quote.network}` };
    // A signed payment can be settled until it expires. Sign only short-lived ones, so a payment we
    // gave up on can't be claimed later against money released for the next top-up.
    if (!(quote.maxTimeoutSeconds > 0 && quote.maxTimeoutSeconds <= MAX_PAY_WINDOW_SECONDS)) return { ok: false, rule: "allowlist", reason: `the payment would stay valid too long (${quote.maxTimeoutSeconds} s)` };
    // 2. Quoted price: the 402 must ask for exactly the order's amount.
    if (quote.amount !== order.amount) return { ok: false, rule: "quoted price", reason: "the price changed after the quote" };
  }
  // 3. Destination: only the meter or phone the daughter saved.
  if (destination !== purse.destinations[utility]) return { ok: false, rule: "destination", reason: "not a number the guardian saved" };
  // 7. Paused (checked early: nothing else matters if the purse is paused).
  if (purse.paused) return { ok: false, rule: "paused", reason: "the guardian paused this purse" };
  // 4 to 6. Per top-up, utility day/week/month, purse month, and the balance.
  const room = headroom(purse, utility, { balanceNgn, now, feeBps });
  if (ngn > room.maxNgn) return { ok: false, rule: room.tightest.rule, reason: `over the ${room.tightest.rule} limit`, period: room.tightest.period };
  return { ok: true };
}

// The smallest top-up each utility sells (naira). Used to turn naira limits into on-chain caps.
export const MIN_TOPUP = { electricity: 500, airtime: 100, data: 100 };

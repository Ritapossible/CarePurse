// The naira price of one USDC. USDC is a US dollar stablecoin, so this is the US dollar to naira
// rate, read when the gateway starts from a public exchange-rate feed (open.er-api.com: free, no
// key, updated daily). If the feed can't be reached, NGN_PER_USDC from the settings is used and
// the source says so.
//
// The rate is fixed for the life of the process on purpose: the x402 price of every top-up is
// set from it when the routes are built, and an order's quoted price must equal its paid price.
// A redeploy or restart picks up the day's new rate.
const FEED = "https://open.er-api.com/v6/latest/USD";
const MAX_DRIFT = 0.25;

export async function liveRate({ fallback, fetchImpl = fetch, timeoutMs = 8000, log = console } = {}) {
  try {
    const res = await fetchImpl(FEED, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.json();
    const ngn = Number(body?.rates?.NGN);
    if (body?.result !== "success" || !(ngn > 0)) throw new Error(`unexpected answer (${body?.result ?? res.status})`);
    // Trusted only near the configured rate (±25%): a broken or hijacked feed can't reprice every
    // top-up. Outside the band, the setting is used and the source says why.
    if (Math.abs(ngn - fallback) / fallback > MAX_DRIFT) throw new Error(`₦${ngn} is more than ${MAX_DRIFT * 100}% from NGN_PER_USDC=${fallback}`);
    return {
      ngnPerUsdc: Math.round(ngn * 100) / 100,
      source: "open.er-api.com (USD to NGN, daily)",
      asOf: body.time_last_update_utc ? new Date(body.time_last_update_utc).toISOString() : new Date().toISOString(),
      live: true,
    };
  } catch (err) {
    log.warn?.(`Exchange rate feed unavailable (${err.message}); using NGN_PER_USDC=${fallback}.`);
    return { ngnPerUsdc: fallback, source: "NGN_PER_USDC setting (feed unavailable)", asOf: new Date().toISOString(), live: false };
  }
}

// The naira price of one USDC. USDC is a US dollar stablecoin, so this is the US dollar to naira
// rate, read when the gateway starts from a public exchange-rate feed (open.er-api.com: free, no
// key, updated daily). If the feed can't be reached, NGN_PER_USDC from the settings is used and
// the source says so.
//
// The rate is read at start and again every few hours (refreshRate). A new rate applies to new
// orders only: each x402 payment asks for the amount quoted on its order, so an order's quoted
// price always equals its paid price.
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

// Re-read the rate every `everyMs` and update `config` in place (ngnPerUsdc and rate). A failed or
// out-of-band reading keeps the current rate rather than falling back to the setting.
export function refreshRate(config, { base, everyMs, log = console, fetchImpl = fetch } = {}) {
  if (!(everyMs > 0)) return null;
  const timer = setInterval(async () => {
    const r = await liveRate({ fallback: base, fetchImpl, log });
    if (!r.live) return;
    if (r.ngnPerUsdc !== config.ngnPerUsdc) log.log?.(`Rate: ₦${config.ngnPerUsdc} → ₦${r.ngnPerUsdc} per USDC`);
    config.rate = r;
    config.ngnPerUsdc = r.ngnPerUsdc;
  }, everyMs);
  timer.unref?.();
  return timer;
}

// The exchange-rate feed: a good answer is used, anything odd falls back to the setting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { liveRate } from "../src/rate.mjs";

const feed = (body) => async () => ({ status: 200, json: async () => body });
const quiet = { warn() {} };

test("uses the feed's USD to NGN rate, rounded to kobo", async () => {
  const r = await liveRate({ fallback: 1470, fetchImpl: feed({ result: "success", time_last_update_utc: "Fri, 20 Nov 2026 00:02:32 +0000", rates: { NGN: 1352.930642 } }) });
  assert.equal(r.ngnPerUsdc, 1352.93);
  assert.equal(r.live, true);
  assert.equal(r.asOf, "2026-11-20T00:02:32.000Z");
});

test("falls back to NGN_PER_USDC when the feed fails or answers nonsense", async () => {
  for (const fetchImpl of [async () => { throw new Error("offline"); }, feed({ result: "error" }), feed({ result: "success", rates: { NGN: 1 } })]) {
    const r = await liveRate({ fallback: 1470, fetchImpl, log: quiet });
    assert.equal(r.ngnPerUsdc, 1470);
    assert.equal(r.live, false);
  }
});

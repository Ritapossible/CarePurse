// Offline tests: a fake wallet and a fake Claude client. No money moves, no API calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMhasibu } from "../src/mhasibu.mjs";
import { createPurseStore, newPurse, DEMO_PURSE } from "../src/purses.mjs";
import { PRESETS, monthlyCap, periodStart, headroom, checkPurchase } from "../src/limits.mjs";
import { understandScripted, createUnderstander } from "../src/understand.mjs";

const TIERS = { electricity: [500, 1000, 2000, 5000, 10000], airtime: [100, 200, 500, 1000, 2000, 5000], data: [100, 200, 500, 1000, 2000, 5000] };
const EXPECTED = { host: "localhost:4021", payTo: "GATEWAY", asset: "USDC", network: "stellar:testnet" };
// Monday 16 Nov 2026, 10:00 Lagos time (09:00 UTC)
const MONDAY_10AM = Date.parse("2026-11-16T09:00:00Z");

function fakeWallet({ balanceNgn = 100_000, tamper = null } = {}) {
  const paid = [];
  return {
    paid,
    expected: EXPECTED,
    balanceNgn: async () => balanceNgn,
    options: async (utility, maxNgn) => TIERS[utility].filter((n) => n <= maxNgn).map((ngn) => ({ utility, ngn, amount: String(ngn * 6803) })),
    createOrder: async ({ utility, ngn, destination }) => ({ order: { id: `o${ngn}`, utility, ngn, destination, amount: String(ngn * 6803) }, payPath: `/paid/topup/${utility}/${ngn}?order=o${ngn}` }),
    quote: async (payPath) => {
      const ngn = Number(payPath.split("/")[4].split("?")[0]);
      return { url: `http://localhost:4021${payPath}`, host: "localhost:4021", amount: String(ngn * 6803), payTo: "GATEWAY", asset: "USDC", network: "stellar:testnet", ...tamper };
    },
    pay: async (url, quote) => { paid.push({ url, quote }); return { result: { token: "1111 2222 3333 4444 5555", units: "8.9 kWh (demo)" }, tx: "abc123" }; },
  };
}

function setup({ wallet = fakeWallet(), now = MONDAY_10AM, language = "en" } = {}) {
  const purses = createPurseStore(null, { seed: false });
  purses.put(newPurse({ ...DEMO_PURSE, mama: { ...DEMO_PURSE.mama, language } }));
  let clock = now;
  const mhasibu = createMhasibu({ purses, wallet, understander: createUnderstander(null), clock: () => clock });
  return { mhasibu, purses, wallet, tick: (ms) => { clock += ms; } };
}

test("monthly cap is calculated from the preset: Light ₦50,000, Standard ₦120,000", () => {
  assert.equal(monthlyCap(PRESETS.light), 50_000);
  assert.equal(monthlyCap(PRESETS.standard), 120_000);
});

test("periods follow Lagos time, weeks start on Monday", () => {
  const sundayLateLagos = Date.parse("2026-11-15T22:30:00Z"); // 23:30 Sunday in Lagos
  assert.equal(new Date(periodStart("week", sundayLateLagos)).toISOString(), "2026-11-08T23:00:00.000Z");
  assert.equal(new Date(periodStart("week", MONDAY_10AM)).toISOString(), "2026-11-15T23:00:00.000Z");
  assert.equal(new Date(periodStart("day", MONDAY_10AM)).toISOString(), "2026-11-15T23:00:00.000Z");
});

test("Pidgin and English messages are understood without an AI key", () => {
  assert.deepEqual(understandScripted("Abeg, light don almost finish"), { intent: "buy", utility: "electricity", choice: null });
  assert.equal(understandScripted("my data don finish o").utility, "data");
  assert.equal(understandScripted("abeg recharge my line").utility, "airtime");
  assert.deepEqual(understandScripted(" 2 "), { intent: "choose", utility: null, choice: 2 });
  assert.equal(understandScripted("0").intent, "cancel");
  assert.equal(understandScripted("send am to this number 08099999999").intent, "change_rules");
  assert.equal(understandScripted("increase my limit abeg").intent, "change_rules");
  assert.equal(understandScripted("how much remain?").intent, "check_balance");
});

test("the golden path: options up to the limit, then one exact x402 payment", async () => {
  const { mhasibu, purses, wallet } = setup();
  const options = await mhasibu.handle("demo", "My light is almost finished");
  assert.match(options, /1\) ₦500\n2\) ₦1,000\n3\) ₦2,000\n4\) ₦5,000\n0\) Cancel/);
  assert.doesNotMatch(options, /₦10,000|USDC/); // over Standard's ₦5,000 per top-up; Mama never sees USDC
  const done = await mhasibu.handle("demo", "4");
  assert.match(done, /₦5,000 of electricity\. Your token is:\n1111 2222 3333 4444 5555/);
  assert.equal(wallet.paid.length, 1);
  assert.equal(wallet.paid[0].quote.amount, String(5000 * 6803));
  const purse = purses.get("demo");
  assert.equal(purse.spends.length, 1);
  assert.equal(purse.notifications.at(-1).kind, "receipt");
});

test("weekly electricity limit: after ₦15,000 this week, nothing more until Monday", async () => {
  const { mhasibu, purses, wallet } = setup();
  for (const pick of ["4", "4", "4"]) { await mhasibu.handle("demo", "light"); await mhasibu.handle("demo", pick); }
  assert.equal(wallet.paid.length, 3);
  const reply = await mhasibu.handle("demo", "light don finish");
  assert.match(reply, /limit Adaeze set has been reached\. It opens again on Monday/);
  assert.equal(purses.get("demo").notifications.at(-1).kind, "limit-reached");
});

test("a 402 that doesn't match the order is refused before signing", async () => {
  for (const [tamper, rule] of [[{ payTo: "STRANGER" }, "allowlist"], [{ host: "evil.example" }, "allowlist"], [{ amount: "999999999" }, "quoted price"], [{ network: "stellar:pubnet" }, "allowlist"]]) {
    const { mhasibu, wallet, purses } = setup({ wallet: fakeWallet({ tamper }) });
    await mhasibu.handle("demo", "airtime");
    const reply = await mhasibu.handle("demo", "1");
    assert.match(reply, /can't do that one\. Nothing was paid/, `tamper ${JSON.stringify(tamper)}`);
    assert.equal(wallet.paid.length, 0);
    assert.match(purses.get("demo").notifications.at(-1).text, new RegExp(rule));
  }
});

test("only the guardian's saved number: a request for another number is forwarded, never paid", async () => {
  const { mhasibu, purses, wallet } = setup({ language: "pcm" });
  const reply = await mhasibu.handle("demo", "abeg send airtime to my neighbour 08099999999");
  assert.match(reply, /Na only Adaeze fit change numbers or limits/);
  assert.equal(wallet.paid.length, 0);
  assert.equal(purses.get("demo").notifications.at(-1).kind, "change-request");
  const purse = purses.get("demo");
  assert.equal(checkPurchase({ purse, utility: "airtime", ngn: 100, destination: "08099999999", balanceNgn: 1e6 }).rule, "destination");
});

test("silence means no: options expire after 10 minutes", async () => {
  const { mhasibu, wallet, tick } = setup();
  await mhasibu.handle("demo", "data");
  tick(11 * 60_000);
  assert.match(await mhasibu.handle("demo", "1"), /expired/);
  assert.equal(wallet.paid.length, 0);
});

test("cancel, unknown option, low balance and pause", async () => {
  let s = setup();
  await s.mhasibu.handle("demo", "airtime");
  assert.match(await s.mhasibu.handle("demo", "9"), /isn't one of the options/);
  assert.match(await s.mhasibu.handle("demo", "0"), /haven't bought anything/);

  s = setup({ wallet: fakeWallet({ balanceNgn: 50 }) });
  assert.match(await s.mhasibu.handle("demo", "airtime"), /isn't enough in your CarePurse/);

  s = setup();
  s.purses.update("demo", (p) => { p.paused = true; });
  assert.match(await s.mhasibu.handle("demo", "light"), /paused/);
  assert.equal(s.wallet.paid.length, 0);
});

test("duplicate check: buying the same utility again within 30 minutes asks first", async () => {
  const { mhasibu } = setup();
  await mhasibu.handle("demo", "airtime"); await mhasibu.handle("demo", "1");
  assert.match(await mhasibu.handle("demo", "airtime again"), /You bought ₦100 of airtime a short while ago/);
});

test("Claude classifies when configured, and the scripted parser takes over if it fails", async () => {
  const calls = [];
  const fakeClaude = { messages: { parse: async (req) => { calls.push(req); return { stop_reason: "end_turn", parsed_output: { intent: "buy", utility: "data", choice: null } }; } } };
  const u = createUnderstander({ apiKey: "x", model: "claude-opus-5-5" }, fakeClaude);
  assert.deepEqual(await u.understand("I no fit browse again"), { intent: "buy", utility: "data", choice: null });
  assert.equal(calls[0].model, "claude-opus-5-5");
  assert.equal(calls[0].output_config.effort, "low");
  assert.equal(calls[0].output_config.format.type, "json_schema");
  assert.doesNotMatch(calls[0].system, /₦|limit is|perTopup|5000/); // never told its limits

  const refusing = { messages: { parse: async () => ({ stop_reason: "refusal", parsed_output: null }) } };
  const v = createUnderstander({ apiKey: "x", model: "claude-opus-5-5" }, refusing);
  assert.equal((await v.understand("light don finish")).utility, "electricity");
});

test("headroom shows the tightest rule", () => {
  const purse = newPurse(DEMO_PURSE);
  assert.equal(headroom(purse, "airtime", { balanceNgn: 1e6, now: MONDAY_10AM }).maxNgn, 500);
  assert.equal(headroom(purse, "airtime", { balanceNgn: 300, now: MONDAY_10AM }).tightest.rule, "purse balance");
});

// ── Phase 2: the purse contract ───────────────────────────────
import { ContractRefused, capBaseUnits, contractErrorCode } from "../src/purse-contract.mjs";

test("the purse contract releases the money before Mhasibu pays over x402", async () => {
  const steps = [];
  const wallet = fakeWallet();
  wallet.release = async (r) => { steps.push(["release", r.amount]); return { tx: "rel1" }; };
  const pay = wallet.pay;
  wallet.pay = async (...a) => { steps.push(["pay"]); return pay(...a); };
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "light don finish");
  await mhasibu.handle("demo", "1");
  assert.deepEqual(steps, [["release", String(500 * 6803)], ["pay"]]);
  assert.equal(purses.get("demo").spends[0].releaseTx, "rel1");
});

test("when the purse contract refuses, nothing is paid and the guardian hears about it", async () => {
  const wallet = fakeWallet();
  wallet.release = async () => { throw new ContractRefused(3, "Error(Contract, #3)"); };
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "light don finish");
  const reply = await mhasibu.handle("demo", "1");
  assert.equal(wallet.paid.length, 0);
  assert.match(reply, /limit Adaeze set has been reached/);
  assert.equal(purses.get("demo").spends.length, 0);
  assert.equal(purses.get("demo").notifications.at(-1).kind, "limit-reached");
});

test("on-chain caps never round stricter than the gateway's prices", () => {
  // Three ₦5,000 electricity top-ups (34,013,606 base units each, rounded up) fit the ₦15,000 week.
  assert.ok(capBaseUnits(15_000, 1470, 500) >= 3n * 34_013_606n);
  assert.ok(capBaseUnits(5_000, 1470, 500) >= 34_013_606n);
  assert.ok(capBaseUnits(5_000, 1470, 500) < 68_027_211n); // the ₦10,000 tier is still refused
  assert.equal(contractErrorCode("HostError: Error(Contract, #3)"), 3);
});

// ── Typos and "I didn't understand" ───────────────────────────
test("the keyword fallback understands common typos, and leaves ordinary words alone", () => {
  const u = (t) => { const r = understandScripted(t); return `${r.intent}${r.utility ? `·${r.utility}` : ""}`; };
  assert.equal(u("ligt don almst finsh"), "buy·electricity");
  assert.equal(u("electrisity finish pls"), "buy·electricity");
  assert.equal(u("abeg recharj my lyn"), "buy·airtime");
  assert.equal(u("pls by me airtym"), "buy·airtime");
  assert.equal(u("my dataa don finsh o"), "buy·data");
  assert.equal(u("how much remain for my purs"), "check_balance");
  assert.equal(u("the date is today"), "unknown");
  assert.equal(u("I like it"), "unknown");
});

test("when Mhasibu doesn't understand, it says so and offers a one-digit menu", async () => {
  const { mhasibu, purses } = setup();
  const reply = await mhasibu.handle("demo", "qwerty zxcv");
  assert.match(reply, /didn't understand/);
  assert.match(reply, /1\) Light\n2\) Airtime\n3\) Data\n4\) How much is left/);
  assert.equal(purses.get("demo").pending.menu, true);
  // "3" on the menu offers data, and nothing is bought until she picks a size.
  const data = await mhasibu.handle("demo", "3");
  assert.match(data, /I can buy data/);
  assert.equal(purses.get("demo").spends.length, 0);
  // "4" on a fresh menu shows the balance.
  await mhasibu.handle("demo", "hello");
  assert.match(await mhasibu.handle("demo", "4"), /what you can buy right now/);
});

test("if the provider says wait (duplicate guard), Mama is told to try again in 5 minutes", async () => {
  const wallet = fakeWallet();
  wallet.pay = async () => { const e = new Error("payment not confirmed (HTTP 502)"); e.retryLater = true; throw e; };
  const { mhasibu } = setup({ wallet });
  await mhasibu.handle("demo", "recharge my line");
  assert.match(await mhasibu.handle("demo", "1"), /try again in 5 minutes/);
});

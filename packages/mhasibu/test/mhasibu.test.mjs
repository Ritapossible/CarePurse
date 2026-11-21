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
      return { url: `http://localhost:4021${payPath}`, host: "localhost:4021", amount: String(ngn * 6803), payTo: "GATEWAY", asset: "USDC", network: "stellar:testnet", maxTimeoutSeconds: 60, ...tamper };
    },
    pay: async (url, quote) => { paid.push({ url, quote }); return { result: { token: "1111 2222 3333 4444 5555", units: "8.9 kWh (demo)" }, tx: "abc123" }; },
  };
}

function setup({ wallet = fakeWallet(), now = MONDAY_10AM, language = "en" } = {}) {
  const purses = createPurseStore(null, { seed: false });
  purses.put(newPurse({ ...DEMO_PURSE, mama: { ...DEMO_PURSE.mama, language } }));
  let clock = now;
  const mhasibu = createMhasibu({ purses, wallet, understander: createUnderstander(null), clock: () => clock, wait: async () => {} });
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
  const reply = await mhasibu.handle("demo", "my light is finished");
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

test("a private model on NEAR AI classifies over the OpenAI-style API, with the same fallback", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ intent: "my_token", utility: "electricity", choice: null }) } }] }) };
  };
  const llm = { api: "openai", apiKey: "k", baseURL: "https://cloud-api.near.ai/v1/", model: "deepseek-ai/DeepSeek-V4.1-Flash-1017" };
  const u = createUnderstander(llm, fakeFetch, { privacy: true });
  assert.equal(u.name, "NEAR AI private, TEE (deepseek-ai/DeepSeek-V4.1-Flash-1017)");
  assert.deepEqual(await u.understand("send my token again"), { intent: "my_token", utility: "electricity", choice: null });
  assert.equal(calls[0].url, "https://cloud-api.near.ai/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer k");
  assert.equal(calls[0].body.response_format.json_schema.strict, true);
  assert.doesNotMatch(calls[0].body.messages[0].content, /₦|limit is|perTopup|5000/); // never told its limits

  assert.equal(u.lastVia, "model");
  const down = createUnderstander(llm, async () => ({ ok: false, status: 503, json: async () => ({}) }), { privacy: true });
  assert.equal((await down.understand("light don finish")).utility, "electricity");
  assert.match(down.lastVia, /^scripted: model call failed \(503\)/); // shown in the live log
  const junk = createUnderstander(llm, async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"intent":"pay_everything"}' } }] }) }), { privacy: true });
  assert.equal((await junk.understand("abeg recharge my line")).utility, "airtime"); // invalid output → scripted
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
  await mhasibu.handle("demo", "my light is finished");
  await mhasibu.handle("demo", "1");
  assert.deepEqual(steps, [["release", String(500 * 6803)], ["pay"]]);
  assert.equal(purses.get("demo").spends[0].releaseTx, "rel1");
});

test("when the purse contract refuses, nothing is paid and the guardian hears about it", async () => {
  const wallet = fakeWallet();
  wallet.release = async () => { throw new ContractRefused(3, "Error(Contract, #3)"); };
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "my light is finished");
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

// A fake Phase 2 wallet: the purse contract (open order by reference), the gateway's order records,
// and the settlement calls. No network.
import { orderRef } from "../src/purse-contract.mjs";
function phase2Wallet() {
  const wallet = fakeWallet();
  const chain = { open: null, orders: {}, refundWorks: true, calls: [], gateway: {} };
  wallet.chain = chain;
  wallet.release = async ({ orderId, utility, amount }) => {
    chain.open = orderRef(orderId); chain.orders[orderRef(orderId)] = { utility, amount };
    if (chain.releaseThrows) throw new Error(chain.releaseThrows); // landed on-chain, but we didn't hear back
    chain.calls.push(`release ${orderId}`); return { tx: "rel" };
  };
  wallet.refundRef = async (ref) => { chain.calls.push(`refund ${ref.slice(0, 6)}`); if (!chain.refundWorks) throw new Error("rpc timeout"); chain.open = null; return { tx: "ref" }; };
  wallet.commitRef = async (ref) => { chain.calls.push(`commit ${ref.slice(0, 6)}`); chain.open = null; return { tx: "com" }; };
  wallet.openOrderRef = async () => chain.open;
  wallet.contractOrder = async (ref) => chain.orders[ref] ?? null;
  wallet.orderStatus = async (id) => chain.gateway[id] ?? { id, status: "failed" };
  wallet.orderByRef = async (ref) => Object.values(chain.gateway).find((o) => orderRef(o.id) === ref) ?? null;
  wallet.payGatewayDirect = async (amount) => { chain.calls.push(`pay-direct ${amount}`); return { tx: "direct" }; };
  return wallet;
}
const R = (id) => orderRef(id).slice(0, 6);

test("a paid top-up is committed on-chain, closing the open order", async () => {
  const wallet = phase2Wallet();
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "my light is finished");
  await mhasibu.handle("demo", "1");
  assert.deepEqual(wallet.chain.calls, ["release o500", `commit ${R("o500")}`]);
  assert.equal(purses.get("demo").openOrder, null);
});

test("payment fails after the release: refunded to the purse", async () => {
  const wallet = phase2Wallet();
  wallet.pay = async () => { throw new Error("payment not confirmed (HTTP 502)"); };
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "my light is finished");
  assert.match(await mhasibu.handle("demo", "1"), /weren't charged/);
  assert.deepEqual(wallet.chain.calls, ["release o500", `refund ${R("o500")}`]);
  assert.equal(purses.get("demo").openOrder, null);
  assert.equal(purses.get("demo").spends.length, 0);
});

test("after a failed payment, no new money is released until the old signature has expired", async () => {
  const wallet = phase2Wallet();
  const pay = wallet.pay;
  wallet.pay = async () => { throw new Error("payment not confirmed (HTTP 502)"); };
  const { mhasibu, purses, tick } = setup({ wallet });
  await mhasibu.handle("demo", "my light is finished");
  await mhasibu.handle("demo", "1"); // signed (60 s window), failed, refunded
  wallet.pay = pay;
  tick(30_000);
  await mhasibu.handle("demo", "my light is finished");
  assert.match(await mhasibu.handle("demo", "1"), /wait one minute/);
  assert.deepEqual(wallet.chain.calls, ["release o500", `refund ${R("o500")}`]); // nothing new released
  tick(61_000); // past the 60 s window + 30 s margin
  await mhasibu.handle("demo", "my light is finished");
  assert.match(await mhasibu.handle("demo", "1"), /Done!/);
  assert.equal(wallet.chain.calls.filter((c) => c.startsWith("release")).length, 2);
});

test("Mhasibu won't sign a payment that stays valid for long", async () => {
  for (const maxTimeoutSeconds of [3600, undefined]) {
    const wallet = fakeWallet({ tamper: { maxTimeoutSeconds } });
    const { mhasibu } = setup({ wallet });
    await mhasibu.handle("demo", "my light is finished");
    await mhasibu.handle("demo", "1");
    assert.equal(wallet.paid.length, 0);
  }
});

test("the provider issued a token but settlement failed: Mama keeps the token, the gateway is paid directly, no refund", async () => {
  const wallet = phase2Wallet();
  wallet.pay = async () => { throw new Error("payment not confirmed (HTTP 402)"); };
  wallet.chain.gateway.o500 = { id: "o500", status: "failed", ngn: 500, issued: { token: "1212 3434 5656 7878 9090", units: "2.2 kWh" } };
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "my light is finished");
  assert.match(await mhasibu.handle("demo", "1"), /1212 3434 5656 7878 9090/);
  assert.deepEqual(wallet.chain.calls, ["release o500", `pay-direct ${500 * 6803}`, `commit ${R("o500")}`]);
  const p = purses.get("demo");
  assert.equal(p.spends[0].token, "1212 3434 5656 7878 9090");
  assert.equal(p.spends[0].paidDirect, true);
  assert.equal(p.openOrder, null);
});

test("a timeout after the release landed: not reported as free, settled on the next message", async () => {
  const wallet = phase2Wallet();
  wallet.chain.releaseThrows = "transaction poll timed out";
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "my light is finished");
  const reply = await mhasibu.handle("demo", "1");
  assert.match(reply, /can't confirm it yet/);
  assert.doesNotMatch(reply, /weren't charged/);
  assert.equal(purses.get("demo").openOrder.released, false); // kept, not deleted
  delete wallet.chain.releaseThrows;
  const next = await mhasibu.handle("demo", "recharge my line");
  assert.deepEqual(wallet.chain.calls, [`refund ${R("o500")}`]); // the chain had it open; the gateway never delivered
  assert.equal(purses.get("demo").openOrder, null);
  assert.match(next, /I can buy airtime/);
});

test("a send error before anything landed: the chain has no open order, so the record is simply cleared", async () => {
  const wallet = phase2Wallet();
  wallet.release = async () => { throw new Error("send failed: txBadSeq"); };
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "my light is finished");
  await mhasibu.handle("demo", "1");
  assert.ok(purses.get("demo").openOrder);
  await mhasibu.handle("demo", "hello");
  assert.equal(purses.get("demo").openOrder, null);
  assert.deepEqual(wallet.chain.calls, []);
});

test("if settling keeps failing: counted as unconfirmed, no new purchase, settled later", async () => {
  const wallet = phase2Wallet();
  wallet.chain.refundWorks = false;
  wallet.pay = async () => { throw new Error("payment not confirmed (HTTP 502)"); };
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "my light is finished");
  assert.match(await mhasibu.handle("demo", "1"), /can't confirm it yet/);
  assert.equal(wallet.chain.calls.filter((c) => c.startsWith("refund")).length, 3); // retried
  assert.equal(purses.get("demo").spends[0].unconfirmed, true);
  assert.match(await mhasibu.handle("demo", "what did I buy"), /not confirmed yet/);
  assert.match(await mhasibu.handle("demo", "recharge my line"), /still finishing your last top-up/);
  assert.equal(wallet.chain.calls.filter((c) => c.startsWith("release")).length, 1);
  wallet.chain.refundWorks = true;
  assert.match(await mhasibu.handle("demo", "recharge my line"), /I can buy airtime/);
  assert.equal(purses.get("demo").openOrder, null);
  assert.equal(purses.get("demo").spends.length, 0);
});

test("a crash right after the release: the next message asks the gateway, keeps the token and commits", async () => {
  const wallet = phase2Wallet();
  const { mhasibu, purses } = setup({ wallet });
  purses.update("demo", (p) => { p.openOrder = { orderId: "o500", ref: orderRef("o500"), utility: "electricity", ngn: 500, amount: "3401500", at: new Date(MONDAY_10AM).toISOString(), released: false, paid: false, attempts: 0 }; });
  wallet.chain.open = orderRef("o500");
  wallet.chain.gateway.o500 = { id: "o500", status: "delivered", ngn: 500, txHash: "abc", token: "9999 8888 7777 6666 5555", units: "2.2 kWh" };
  await mhasibu.handle("demo", "hello");
  assert.deepEqual(wallet.chain.calls, [`commit ${R("o500")}`]);
  assert.equal(purses.get("demo").openOrder, null);
  assert.match(await mhasibu.handle("demo", "send my token again"), /9999 8888 7777 6666 5555/);
});

test("the order id was lost: the chain's open order is settled by its reference alone", async () => {
  const wallet = phase2Wallet();
  const { mhasibu } = setup({ wallet });
  wallet.chain.open = orderRef("lost1");
  wallet.chain.orders[orderRef("lost1")] = { utility: "airtime", amount: "680300" };
  wallet.chain.gateway.lost1 = { id: "lost1", status: "failed", ngn: 100 };
  const { ContractRefused } = await import("../src/purse-contract.mjs");
  wallet.release = async () => { throw new ContractRefused(15, "Error(Contract, #15)"); }; // the contract: order open
  await mhasibu.handle("demo", "my light is finished");
  assert.match(await mhasibu.handle("demo", "1"), /still finishing your last top-up/);
  assert.deepEqual(wallet.chain.calls, [`refund ${R("lost1")}`]); // returned to the purse by reference
  assert.equal(wallet.chain.open, null);
});


test("'NEPA card' and 'meter card' are electricity, 'recharge card' is airtime", () => {
  assert.equal(understandScripted("my NEPA card don finish").utility, "electricity");
  assert.equal(understandScripted("buy meter card for me").utility, "electricity");
  assert.equal(understandScripted("buy recharge card").utility, "airtime");
});

// ── The token never disappears ────────────────────────────────
test("the token is kept with the purchase, in Adaeze's receipt, and Mama can ask for it again", async () => {
  const { mhasibu, purses } = setup();
  await mhasibu.handle("demo", "my light is finished");
  await mhasibu.handle("demo", "1");
  const p = purses.get("demo");
  assert.equal(p.spends[0].token, "1111 2222 3333 4444 5555");
  assert.equal(p.spends[0].units, "8.9 kWh (demo)");
  assert.match(p.notifications.find((n) => n.kind === "receipt").text, /Token: 1111 2222 3333 4444 5555/);
  // Many messages later, in different words:
  for (const t of ["hello", "how much is left", "recharge my line", "0"]) await mhasibu.handle("demo", t);
  assert.match(await mhasibu.handle("demo", "send my token again"), /Your last electricity token \(₦500, .*\) is:\n1111 2222 3333 4444 5555\n\(8\.9 kWh \(demo\)\)/);
  assert.match(await mhasibu.handle("demo", "I no see the token"), /1111 2222 3333 4444 5555/);
  // From the menu (5), and in her purchase history.
  await mhasibu.handle("demo", "qwerty");
  assert.match(await mhasibu.handle("demo", "5"), /1111 2222 3333 4444 5555/);
  assert.match(await mhasibu.handle("demo", "what did I buy"), /token 1111 2222 3333 4444 5555/);
});

test("'my token don finish' is a purchase, not a request to see the old token", () => {
  assert.equal(understandScripted("my token don finish").intent, "buy");
  assert.equal(understandScripted("send my token again").intent, "my_token");
});

// ── Service fee: Adaeze sees it, Mama never does ──────────────
function feeWallet(balanceNgn = 100_000) {
  const wallet = fakeWallet({ balanceNgn });
  const createOrder = wallet.createOrder;
  wallet.createOrder = async (args) => {
    const r = await createOrder(args);
    return { ...r, order: { ...r.order, feeNgn: args.ngn * 0.03, chargedNgn: args.ngn * 1.03 } };
  };
  return wallet;
}

test("the 3% service fee is in Adaeze's receipt and the purchase record, never in Mama's chat", async () => {
  const wallet = feeWallet();
  const { mhasibu, purses } = setup({ wallet });
  const replies = [];
  for (const t of ["light don finish", "1", "send my token again", "what did I buy", "how much remain"]) replies.push(await mhasibu.handle("demo", t));
  for (const r of replies) assert.doesNotMatch(r, /fee|₦515|515/i); // Mama sees face value only
  assert.match(replies[1], /₦500/);
  const p = purses.get("demo");
  assert.equal(p.spends[0].ngn, 500);
  assert.equal(p.spends[0].feeNgn, 15);
  assert.equal(p.spends[0].chargedNgn, 515);
  assert.match(p.notifications.find((n) => n.kind === "receipt").text, /Charged ₦515 \(₦500 \+ ₦15 service fee\)/);
});

test("the balance rule includes the fee: ₦5,100 in the purse can't buy ₦5,000 of light (₦5,150 with the fee)", async () => {
  const room = headroom(newPurse(DEMO_PURSE), "electricity", { balanceNgn: 5100, now: MONDAY_10AM, feeBps: 300 });
  assert.equal(room.tightest.rule, "purse balance");
  assert.ok(room.maxNgn < 5000 && room.maxNgn >= 4951);
  const { mhasibu } = setup({ wallet: feeWallet(5100) });
  assert.doesNotMatch(await mhasibu.handle("demo", "my light is finished"), /₦5,000/);
});

test("on-chain caps include the fee, so they never refuse what the code allows", () => {
  // Three ₦5,000 top-ups at ₦5,150 each (35,034,014 base units, rounded up) fit the ₦15,000 week cap.
  assert.ok(capBaseUnits(15_000, 1470, 500, 7, 300) >= 3n * 35_034_014n);
  assert.ok(capBaseUnits(5_000, 1470, 500, 7, 300) >= 35_034_014n);
  assert.ok(capBaseUnits(5_000, 1470, 500, 7, 300) < 70_068_027n); // the ₦10,000 tier is still refused
});

test("the x402 client's ceiling covers the largest top-up (10,000 naira + fee) and nothing much bigger", async () => {
  const { maxPaymentUsd } = await import("../src/wallet.mjs");
  assert.equal(maxPaymentUsd({ serviceFeeBps: 300, ngnPerUsdc: 1470 }), "$7.01"); // 10,300 / 1,470 = 7.0068
  assert.equal(maxPaymentUsd({ serviceFeeBps: 0, ngnPerUsdc: 1470 }), "$6.81");
});

// ── Recovery never races the facilitator ──────────────────────
function openOrderFor(purses, id, atMs) {
  purses.update("demo", (p) => { p.openOrder = { orderId: id, ref: orderRef(id), utility: "electricity", ngn: 500, amount: "3503402", at: new Date(atMs).toISOString(), released: true, paid: false, attempts: 0 }; });
}

test("still fulfilling with a token issued: wait (no direct pay, no refund) while x402 may still settle", async () => {
  const wallet = phase2Wallet();
  const { mhasibu, purses, tick } = setup({ wallet });
  openOrderFor(purses, "o1", MONDAY_10AM);
  wallet.chain.open = orderRef("o1");
  wallet.chain.gateway.o1 = { id: "o1", status: "fulfilling", ngn: 500, createdAt: new Date(MONDAY_10AM).toISOString(), issued: { token: "1111 0000 1111 0000 1111" } };
  await mhasibu.handle("demo", "hello");
  assert.deepEqual(wallet.chain.calls, []); // nothing paid twice, nothing refunded
  assert.ok(purses.get("demo").openOrder);
  // Past the window, settlement is impossible: now the token is kept and the gateway paid directly.
  tick(31 * 60_000);
  await mhasibu.handle("demo", "hello");
  assert.deepEqual(wallet.chain.calls, ["pay-direct 3503402", `commit ${R("o1")}`]);
  assert.equal(purses.get("demo").openOrder, null);
});

test("created and not yet expired: wait; once expired: refund", async () => {
  const wallet = phase2Wallet();
  const { mhasibu, purses, tick } = setup({ wallet });
  openOrderFor(purses, "o2", MONDAY_10AM);
  wallet.chain.open = orderRef("o2");
  wallet.chain.gateway.o2 = { id: "o2", status: "created", ngn: 500, createdAt: new Date(MONDAY_10AM).toISOString(), expiresAt: new Date(MONDAY_10AM + 10 * 60_000).toISOString() };
  await mhasibu.handle("demo", "hello");
  assert.deepEqual(wallet.chain.calls, []);
  tick(11 * 60_000);
  await mhasibu.handle("demo", "hello");
  assert.deepEqual(wallet.chain.calls, [`refund ${R("o2")}`]);
});

test("an order known only from the chain, still fulfilling: wait (its start comes from the gateway)", async () => {
  const wallet = phase2Wallet();
  const { mhasibu } = setup({ wallet });
  wallet.chain.open = orderRef("o3");
  wallet.chain.orders[orderRef("o3")] = { utility: "electricity", amount: "3503402" };
  wallet.chain.gateway.o3 = { id: "o3", status: "fulfilling", ngn: 500, createdAt: new Date(MONDAY_10AM).toISOString(), issued: { token: "2222 3333 4444 5555 6666" } };
  const { ContractRefused } = await import("../src/purse-contract.mjs");
  wallet.release = async () => { throw new ContractRefused(15, "Error(Contract, #15)"); };
  await mhasibu.handle("demo", "my light is finished");
  await mhasibu.handle("demo", "1");
  assert.deepEqual(wallet.chain.calls, []); // neither paid nor refunded while it may still settle
});

// ── Privacy ────────────────────────────────────────────────────
test("on-chain meter/phone fingerprints are keyed and salted per purse, never a plain sha256", async () => {
  const { destHash, sha256, buyArgs } = await import("../src/purse-contract.mjs");
  const a = destHash("45012345678", { key: "k1", contractId: "CPURSE1" });
  assert.equal(a.length, 32);
  assert.deepEqual(a, destHash("45012345678", { key: "k1", contractId: "CPURSE1" })); // stable, so the contract can compare
  assert.notDeepEqual(a, sha256("45012345678")); // can't be found by hashing every number
  assert.notDeepEqual(a, destHash("45012345678", { key: "k1", contractId: "CPURSE2" })); // differs per purse
  assert.notDeepEqual(a, destHash("45012345678", { key: "k2", contractId: "CPURSE1" })); // needs the key
  assert.throws(() => destHash("45012345678", { contractId: "CPURSE1" }), /No destination hash key/);
  assert.throws(() => buyArgs({ utility: "electricity", destination: "45012345678", amount: 1n, orderId: "o" }), /No destination hash key/);
});

test("records are sealed with AES-256-GCM before they reach the database", async () => {
  const { sealer } = await import("../src/records.mjs");
  assert.equal(sealer(""), null);
  const box = sealer("a-render-generated-value");
  const doc = { destinations: { electricity: "45012345678" }, history: ["light don finish"], token: "6563 5138 0000" };
  const sealed = box.seal("purse", "demo", doc);
  assert.deepEqual(Object.keys(sealed), ["enc"]);
  assert.doesNotMatch(JSON.stringify(sealed), /4501|light|6563/);
  assert.notEqual(sealed.enc, box.seal("purse", "demo", doc).enc); // fresh IV every time
  assert.deepEqual(box.open("purse", "demo", sealed), doc);
  assert.throws(() => box.open("purse", "someone-else", sealed)); // can't be moved to another row
  assert.throws(() => sealer("wrong-key").open("purse", "demo", sealed));
});

test("the live log masks meter and phone numbers but keeps amounts and tokens readable", async () => {
  const { maskNumbers } = await import("../src/replies.mjs");
  assert.equal(maskNumbers("I fit buy light for meter 1111111111111:"), "I fit buy light for meter •••••••••1111:");
  assert.equal(maskNumbers("send to 08099999999 abeg"), "send to •••••••9999 abeg");
  assert.equal(maskNumbers("0.3503401 USDC for ₦515"), "0.3503401 USDC for ₦515");
  assert.equal(maskNumbers("token 0138 6374 0030 7799 5080"), "token 0138 6374 0030 7799 5080");
});

test("a NEAR model that NEAR marks not private is never sent Mama's words", async () => {
  const { nearPrivacy, openUnderstander } = await import("../src/understand.mjs");
  const list = { models: [
    { modelId: "deepseek-ai/DeepSeek-V4.1-Flash-1017", metadata: { verifiable: true } },
    { modelId: "deepseek/deepseek-v4.1-flash", metadata: { verifiable: false, aliases: ["deepseek-v4.1-flash"] } },
  ] };
  const calls = [];
  const fetchImpl = async (url) => { calls.push(String(url)); return { ok: true, json: async () => list }; };
  const base = { api: "openai", apiKey: "k", baseURL: "https://cloud-api.near.ai/v1" };
  assert.equal(await nearPrivacy({ ...base, model: "deepseek-ai/DeepSeek-V4.1-Flash-1017" }, fetchImpl), true);
  assert.equal(await nearPrivacy({ ...base, model: "deepseek-v4.1-flash" }, fetchImpl), false); // by alias
  assert.equal(await nearPrivacy({ ...base, model: "no-such-model" }, fetchImpl), null);
  assert.equal(calls[0], "https://cloud-api.near.ai/v1/model/list");

  const quiet = { warn() {} };
  const refused = await openUnderstander({ ...base, model: "deepseek/deepseek-v4.1-flash" }, { fetchImpl, log: quiet });
  assert.match(refused.name, /^scripted .*refused: not private/);
  assert.equal((await refused.understand("light don finish")).utility, "electricity"); // answered on our server
  // Fails closed: list down, or an id the list doesn't have → never sent.
  const down = async () => { throw new Error("offline"); };
  assert.match((await openUnderstander({ ...base, model: "deepseek-ai/DeepSeek-V4.1-Flash-1017" }, { fetchImpl: down, log: quiet })).name, /refused: privacy not confirmed/);
  assert.match((await openUnderstander({ ...base, model: "deepseek-ai/DeepSeek-V4.1-Flash-1017-typo" }, { fetchImpl, log: quiet })).name, /refused: privacy not confirmed/);
  assert.match(createUnderstander({ ...base, model: "x" }, async () => { throw new Error("never called"); }).name, /refused/); // no answer given = not sent
  const ok = await openUnderstander({ ...base, model: "deepseek-ai/DeepSeek-V4.1-Flash-1017" }, { fetchImpl, log: quiet });
  assert.equal(ok.name, "NEAR AI private, TEE (deepseek-ai/DeepSeek-V4.1-Flash-1017)");
});

test("each family's purse pays from its own contract", async () => {
  const byContract = {};
  const walletFor = (contractId) => (byContract[contractId] ??= phase2Wallet());
  const purses = createPurseStore(null, { seed: false });
  purses.put(newPurse({ ...DEMO_PURSE, id: "okafor", contractId: "CONTRACT_OKAFOR" }));
  purses.put(newPurse({ ...DEMO_PURSE, id: "bello", contractId: "CONTRACT_BELLO" }));
  const mhasibu = createMhasibu({ purses, wallet: fakeWallet(), walletFor, understander: createUnderstander(null), clock: () => MONDAY_10AM, wait: async () => {} });
  await mhasibu.handle("okafor", "my light is finished");
  await mhasibu.handle("okafor", "1");
  assert.deepEqual(byContract.CONTRACT_OKAFOR.chain.calls, ["release o500", `commit ${R("o500")}`]);
  assert.equal(byContract.CONTRACT_BELLO, undefined); // the other family's purse was never touched
});

test("language is read from Mama's own words, not picked at sign-up", async () => {
  const { detectLanguage } = await import("../src/language.mjs");
  for (const t of ["Abeg buy light for me", "ligt don almst finsh", "wetin remain for my purse", "Make I get airtime", "light don finish o"]) assert.equal(detectLanguage(t), "pcm", t);
  for (const t of ["Please buy light for me", "My light is almost finished", "How much is left?", "I need data please", "Thank you"]) assert.equal(detectLanguage(t), "en", t);
  for (const t of ["1", "500", "light", "airtime", ""]) assert.equal(detectLanguage(t), null, t);

  const { mhasibu, purses } = setup({ language: "en" });
  const pidgin = await mhasibu.handle("demo", "Abeg buy light for me");
  assert.match(pidgin, /I fit buy light/);
  assert.equal(purses.get("demo").mama.language, "pcm");
  const stillPidgin = await mhasibu.handle("demo", "0"); // no sign: keeps her last language
  const english = await mhasibu.handle("demo", "Please buy light for me");
  assert.match(english, /I can buy light/);
  assert.equal(purses.get("demo").mama.language, "en");
  assert.ok(stillPidgin);
});

test("'What can you help me do?' lists every service, in her language, with the menu", async () => {
  for (const t of ["What can you help me do?", "what can you do", "Who are you?", "wetin you fit do for me", "how you fit help me", "what services do you offer"]) {
    assert.equal(understandScripted(t).intent, "help", t);
  }
  assert.equal(understandScripted("Can you help me buy light").intent, "buy");

  const { mhasibu } = setup({ language: "en" });
  const en = await mhasibu.handle("demo", "What can you help me do?");
  for (const s of ["Buy electricity", "Buy airtime", "Buy data", "how much is left", "last light token", "what you've bought", "1) Light"]) assert.ok(en.includes(s), s);
  assert.match(await mhasibu.handle("demo", "1"), /I can buy light/); // the menu works right after

  const pcm = await mhasibu.handle("demo", "wetin you fit do for me");
  assert.match(pcm, /See wetin I fit do/);
});

test("Mama can ask her balance in naira: face value (no fee), then what she can buy now", async () => {
  for (const t of ["What is my balance in naira?", "How much do I have?", "How much is in my purse", "how much money I get", "wetin remain"]) {
    assert.equal(understandScripted(t).intent, "check_balance", t);
  }
  assert.equal(understandScripted("Buy 500 naira light").intent, "buy");

  const { mhasibu } = setup({ wallet: fakeWallet({ balanceNgn: 10_300 }), language: "en" });
  const { config } = await import("../src/config.mjs");
  const faceValue = Math.floor((10_300 * 10_000) / (10_000 + (config.serviceFeeBps ?? 0)));
  const en = await mhasibu.handle("demo", "What is my balance in naira?");
  assert.ok(en.startsWith(`Your purse has ₦${faceValue.toLocaleString("en-NG")}.`), en);
  assert.match(en, /Here's what you can buy right now:\nlight: up to ₦/);
  assert.match(await mhasibu.handle("demo", "abeg how much money I get for my purse"), /^Money for your purse: ₦/);
});

test("Mama can see her purchase history: menu 6 or in her own words, newest first, with this month's total", async () => {
  const { mhasibu } = setup({ language: "en" });
  assert.match(await mhasibu.handle("demo", "What have I bought?"), /You haven't bought anything yet/);
  await mhasibu.handle("demo", "my light is finished");
  await mhasibu.handle("demo", "1"); // ₦500 of light
  await mhasibu.handle("demo", "airtime");
  await mhasibu.handle("demo", "2"); // ₦200 airtime
  const menu = await mhasibu.handle("demo", "qwerty");
  assert.match(menu, /6\) What I bought/);
  const list = await mhasibu.handle("demo", "6");
  assert.match(list, /^Your last top-ups:\n.*₦200 airtime\n.*₦500 light · token 1111 2222 3333 4444 5555\nThis month: ₦700\.$/);
  assert.equal(understandScripted("Show my purchase history").intent, "history");
  assert.match(await mhasibu.handle("demo", "abeg wetin I don buy"), /^Wetin you don buy last:/);
});

test("Mama can ask about one day or period: 'yesterday', 'on 16 Nov', 'last week', narrowed by utility", async () => {
  const { parseDay } = await import("../src/days.mjs");
  const FRI_9PM = Date.parse("2026-11-20T20:00:00Z"); // Friday 20 Nov, 21:00 in Lagos
  const iso = (r) => r && [new Date(r.from).toISOString(), new Date(r.to).toISOString()];
  assert.deepEqual(iso(parseDay("what did I buy yesterday", FRI_9PM)), ["2026-11-18T23:00:00.000Z", "2026-11-19T23:00:00.000Z"]);
  assert.deepEqual(iso(parseDay("on 16 Nov", FRI_9PM)), ["2026-11-15T23:00:00.000Z", "2026-11-16T23:00:00.000Z"]);
  assert.deepEqual(iso(parseDay("November 16th", FRI_9PM)), iso(parseDay("16/11", FRI_9PM)));
  assert.deepEqual(iso(parseDay("on Monday", FRI_9PM)), iso(parseDay("16 Nov", FRI_9PM)));
  assert.equal(parseDay("wetin I buy last week", FRI_9PM).label, "last week");
  assert.equal(parseDay("on 25 Dec", FRI_9PM).from, Date.parse("2025-12-24T23:00:00Z")); // no year: the last one, not the future
  assert.equal(parseDay("31 Feb", FRI_9PM), null);
  assert.equal(parseDay("my meter 45012345678", FRI_9PM), null);
  assert.equal(parseDay("what did I buy", FRI_9PM), null);

  const { mhasibu, tick } = setup({ language: "en" }); // Monday 16 Nov, 10:00 Lagos
  await mhasibu.handle("demo", "my light is finished");
  await mhasibu.handle("demo", "1"); // ₦500 light, Monday
  tick(24 * 60 * 60 * 1000); // Tuesday
  await mhasibu.handle("demo", "airtime");
  await mhasibu.handle("demo", "2"); // ₦200 airtime, Tuesday
  assert.equal(understandScripted("did I buy light on Monday?").intent, "history");

  const monday = await mhasibu.handle("demo", "What did I buy yesterday?");
  assert.match(monday, /^What you bought yesterday:\n10:00.*₦500 light · token 1111 2222 3333 4444 5555\nTotal: ₦500 \(1 top-up\)\.$/);
  assert.match(await mhasibu.handle("demo", "what did I buy on 16 Nov"), /^What you bought on Mon, 16 Nov:/);
  assert.match(await mhasibu.handle("demo", "did I buy airtime on Monday?"), /^You didn't buy airtime on Mon, 16 Nov\.$/);
  assert.match(await mhasibu.handle("demo", "what did I buy this week"), /₦200 airtime\n.*₦500 light.*\nTotal: ₦700 \(2 top-ups\)\.$/);
  assert.match(await mhasibu.handle("demo", "abeg wetin I buy for 1 Nov"), /^You no buy anything on Sun, 1 Nov\.$/);
});

test("on-chain caps leave room for the naira strengthening after setup (₦5,000 top-up, 1470 → 1352.93)", async () => {
  const { capBaseUnits, capRate } = await import("../src/purse-contract.mjs");
  const cap = capBaseUnits(5000, capRate({ ngnPerUsdc: 1470, capRateMarginBps: 2000 }), 500, 7, 300);
  const priceLater = BigInt(Math.ceil((5000 * 1.03 / 1352.93) * 1e7));
  assert.ok(priceLater <= cap, `${priceLater} should fit under ${cap}`);
  const noMargin = capBaseUnits(5000, capRate({ ngnPerUsdc: 1470, capRateMarginBps: 0 }), 500, 7, 300);
  assert.ok(priceLater > noMargin); // without the room, the contract would have refused it
});

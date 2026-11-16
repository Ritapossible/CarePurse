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

test("a private model on NEAR AI classifies over the OpenAI-style API, with the same fallback", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ intent: "my_token", utility: "electricity", choice: null }) } }] }) };
  };
  const llm = { api: "openai", apiKey: "k", baseURL: "https://cloud-api.near.ai/v1/", model: "deepseek/deepseek-v4.1-flash" };
  const u = createUnderstander(llm, fakeFetch);
  assert.equal(u.name, "NEAR AI private (deepseek/deepseek-v4.1-flash)");
  assert.deepEqual(await u.understand("send my token again"), { intent: "my_token", utility: "electricity", choice: null });
  assert.equal(calls[0].url, "https://cloud-api.near.ai/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer k");
  assert.equal(calls[0].body.response_format.json_schema.strict, true);
  assert.doesNotMatch(calls[0].body.messages[0].content, /₦|limit is|perTopup|5000/); // never told its limits

  const down = createUnderstander(llm, async () => ({ ok: false, status: 503, json: async () => ({}) }));
  assert.equal((await down.understand("light don finish")).utility, "electricity");
  const junk = createUnderstander(llm, async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"intent":"pay_everything"}' } }] }) }));
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
  await mhasibu.handle("demo", "light don finish");
  await mhasibu.handle("demo", "1");
  assert.deepEqual(wallet.chain.calls, ["release o500", `commit ${R("o500")}`]);
  assert.equal(purses.get("demo").openOrder, null);
});

test("payment fails after the release: refunded to the purse", async () => {
  const wallet = phase2Wallet();
  wallet.pay = async () => { throw new Error("payment not confirmed (HTTP 502)"); };
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "light don finish");
  assert.match(await mhasibu.handle("demo", "1"), /weren't charged/);
  assert.deepEqual(wallet.chain.calls, ["release o500", `refund ${R("o500")}`]);
  assert.equal(purses.get("demo").openOrder, null);
  assert.equal(purses.get("demo").spends.length, 0);
});

test("the provider issued a token but settlement failed: Mama keeps the token, the gateway is paid directly, no refund", async () => {
  const wallet = phase2Wallet();
  wallet.pay = async () => { throw new Error("payment not confirmed (HTTP 402)"); };
  wallet.chain.gateway.o500 = { id: "o500", status: "failed", ngn: 500, issued: { token: "1212 3434 5656 7878 9090", units: "2.2 kWh" } };
  const { mhasibu, purses } = setup({ wallet });
  await mhasibu.handle("demo", "light don finish");
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
  await mhasibu.handle("demo", "light don finish");
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
  await mhasibu.handle("demo", "light don finish");
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
  await mhasibu.handle("demo", "light don finish");
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
  await mhasibu.handle("demo", "light don finish");
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
  await mhasibu.handle("demo", "light don finish");
  await mhasibu.handle("demo", "1");
  const p = purses.get("demo");
  assert.equal(p.spends[0].token, "1111 2222 3333 4444 5555");
  assert.equal(p.spends[0].units, "8.9 kWh (demo)");
  assert.match(p.notifications.find((n) => n.kind === "receipt").text, /Token: 1111 2222 3333 4444 5555/);
  // Many messages later, in different words:
  for (const t of ["hello", "how much remain", "recharge my line", "0"]) await mhasibu.handle("demo", t);
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
  assert.doesNotMatch(await mhasibu.handle("demo", "light don finish"), /₦5,000/);
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
  await mhasibu.handle("demo", "light don finish");
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

// Mhasibu's API for the web app. Holds the agent wallet's key, so it runs server-side only.
//   POST /v1/chat            { purse, text } → { reply }
//   GET  /v1/history?purse=  Mama's chat so far
//   GET  /v1/tokens?purse=   her electricity tokens, newest first
//   GET  /v1/events?purse=   live Agent & x402 Log (Server-Sent Events)
//   GET  /v1/status          phase, understander, contract and wallet addresses (public keys only)
// Every route except /v1/status needs MHASIBU_API_KEY as "Authorization: Bearer <key>". The web app
// adds it on its server side, so browsers never see it. Without a key set, only requests from this
// machine are accepted (local development).
//   POST /v1/demo/overspend  demo only (DEMO_MODE=1): bypass Mhasibu's code checks and ask
//                            the purse contract for more than the cap, to show the on-chain refusal
//   POST /v1/demo/wrong-destination  demo only: ask the contract to pay an unsaved meter
// npm run serve   (port MHASIBU_PORT, default 4022)
import http from "node:http";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { Keypair } from "@stellar/stellar-sdk";
import { config, explorer } from "../src/config.mjs";
import { createMhasibu } from "../src/mhasibu.mjs";
import { openUnderstander } from "../src/understand.mjs";
import { createSignup } from "../src/signup.mjs";
import { createFamilies, FamilyError } from "../src/families.mjs";
import { openPurseStore } from "../src/purses.mjs";
import { PRESETS, monthlyCap } from "../src/limits.mjs";
import { ContractRefused, buyArgs, createSoroban, inOrder, refundArgs, symbol } from "../src/purse-contract.mjs";
import { maskNumbers } from "../src/replies.mjs";
import { createSms } from "../src/sms.mjs";

const port = Number(process.env.PORT) || Number(process.env.MHASIBU_PORT ?? 4022); // Render sets PORT
const demoMode = process.env.DEMO_MODE === "1";
const apiKey = (process.env.MHASIBU_API_KEY ?? "").trim();
if (apiKey && apiKey.length < 24) throw new Error("MHASIBU_API_KEY must be at least 24 characters.");

// Constant-time check of the bearer key; without a key, only loopback requests are allowed.
function authorised(req) {
  if (!apiKey) return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
  const given = Buffer.from(String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(apiKey);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
// Each live-log listener follows one purse; events carry the purse they belong to.
const clients = new Map(); // res -> purse id
const currentPurse = new AsyncLocalStorage();

function emit(event) {
  // The live log is for watching the agent, not for reading Mama's numbers: chat lines can hold her
  // meter or a phone number, so long digit runs keep only their last 4 ("•••••••••1111").
  const e = { at: new Date().toISOString(), ...event };
  for (const k of ["text", "message"]) if (typeof e[k] === "string") e[k] = maskNumbers(e[k]);
  if (e.tx) e.link = explorer.tx(e.tx);
  // Outside a chat (sign-up routes, background jobs) an event belongs to no family's log.
  e.purse = e.purse ?? currentPurse.getStore() ?? "system";
  const line = `data: ${JSON.stringify(e)}\n\n`;
  for (const [res, purse] of clients) if (purse === e.purse) res.write(line);
}

// The naira rate comes from the gateway, so both price with the same number (it reads today's
// USD to NGN rate at start). Fetched in the background so the server answers health checks at
// once; until it arrives, the NGN_PER_USDC setting is used. The two start together, so retry.
config.rate = { ngnPerUsdc: config.ngnPerUsdc, source: "NGN_PER_USDC setting", asOf: null, live: false };
(async () => {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(new URL("/v1/rate", config.gatewayUrl)).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r?.ngnPerUsdc > 0) { config.rate = r; config.ngnPerUsdc = r.ngnPerUsdc; console.log(`Rate: ₦${r.ngnPerUsdc} per USDC (${r.source})`); return; }
    await new Promise((done) => setTimeout(done, 2000));
  }
  console.warn(`Rate: gateway didn't answer; using NGN_PER_USDC=${config.ngnPerUsdc}`);
})();
// The gateway re-reads the rate every few hours; follow it hourly. Mama's options and balance use
// the new rate; each payment still asks for exactly what its order was quoted.
setInterval(async () => {
  const r = await fetch(new URL("/v1/rate", config.gatewayUrl)).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (!(r?.ngnPerUsdc > 0) || r.ngnPerUsdc === config.ngnPerUsdc) return;
  console.log(`Rate: ₦${config.ngnPerUsdc} → ₦${r.ngnPerUsdc} per USDC`);
  config.rate = r;
  config.ngnPerUsdc = r.ngnPerUsdc;
}, 60 * 60_000).unref();

const purses = await openPurseStore({ file: config.pursesFile, databaseUrl: config.databaseUrl });
console.log(config.databaseUrl ? "Purses: Postgres (DATABASE_URL)" : `Purses: ${config.pursesFile} (set DATABASE_URL to keep them across restarts)`);
const sms = createSms(config.sms);
console.log(sms.configured ? "SMS: Termii" : `SMS: off${config.showMamaCode ? " (demo: Mama's code is shown on screen)" : " (set TERMII_API_KEY)"}`);
const mhasibu = createMhasibu({ purses, log: emit, sms, understander: await openUnderstander(config.llm) });
const agentAddress = Keypair.fromSecret(config.agentSecret).publicKey();

// Sign-up, invites and Mama's sign-in. The web app's server checks who is calling (the daughter's
// Privy login, Mama's session) before it reaches these routes; they all need Mhasibu's key.
const gatewayAuth = config.gatewayApiKey ? { authorization: `Bearer ${config.gatewayApiKey}` } : {};
const signup = createSignup({ config });
const families = createFamilies({
  purses,
  signup,
  config,
  sms,
  verifyMeter: async (meter, disco) => {
    const u = new URL(`/v1/meters/${meter}`, config.gatewayUrl);
    if (disco) u.searchParams.set("disco", disco);
    const res = await fetch(u, { headers: gatewayAuth });
    const body = await res.json().catch(() => ({}));
    // The VTpass code (never a key) travels back so a failed check can be told apart from a wrong meter.
    return { ok: Boolean(body.ok), ownerName: body.ownerName ?? null, address: body.address ?? null, disco: body.disco ?? disco ?? null, reason: body.reason ?? null, unavailable: Boolean(body.unavailable), vtpass: body.vtpass?.code ? { code: body.vtpass.code, message: body.vtpass.message ?? null, ...(body.vtpass.keys ? { keys: body.vtpass.keys } : {}) } : null };
  },
});

// A plan changed in code (e.g. Standard data ₦500 → ₦1,000 a time) is adopted for a purse only once
// its on-chain caps already allow it: the demo purse after `npm run sync-purse`; a family's purse
// after the daughter approves "Update rules" (that path updates both). Never looser than the chain.
// Checked against today's live rate only (fetched in the background at start), so a fallback rate
// can't make old caps look big enough.
async function adoptPlans() {
  if (!config.rate?.live) return false;
  for (const p of purses.all?.() ?? []) {
    const plan = PRESETS[p.preset];
    const contractId = p.contractId ?? (p.id === "demo" ? config.purseContractId : null);
    if (!plan || !contractId || JSON.stringify(p.limits) === JSON.stringify(plan)) continue;
    const behind = await signup.capsBehind({ contractId, limits: plan }).catch(() => true);
    if (behind) continue;
    purses.update(p.id, (x) => { x.limits = structuredClone(plan); x.monthlyCap = monthlyCap(plan); });
    console.log(`Plan: ${p.id} now uses the current ${p.preset} limits (its on-chain caps allow them)`);
  }
  await purses.flush?.();
  return true;
}
// Every 2 minutes until a live rate is in, then hourly (catches a purse synced on-chain later).
(function scheduleAdopt(delay) {
  setTimeout(async () => {
    const ran = await adoptPlans().catch((err) => { console.warn(`Plan check failed: ${err.message}`); return false; });
    scheduleAdopt(ran ? 60 * 60_000 : 2 * 60_000);
  }, delay).unref();
})(90_000);

// Each family's own agent wallet pays its network fees: check hourly, top up from the operator
// below 2 XLM. One failure is logged and retried next hour.
setInterval(async () => {
  for (const p of purses.all?.() ?? []) {
    if (!p.agent?.address) continue;
    const sent = await signup.topUpAgentXlm(p.agent.address).catch((err) => { console.warn(`XLM top-up for ${p.id} failed: ${err.message}`); return 0; });
    if (sent) console.log(`XLM top-up: ${sent} XLM to ${p.id}'s agent wallet`);
  }
}, 60 * 60_000).unref();

// Simple sliding-window limits (one instance): chat per purse, and the demo's attack buttons.
const hits = new Map();
function tooMany(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3_600_000)) hits.delete(k); }, 10 * 60_000).unref();

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
// A JSON body of at most `max` characters. Too large, broken or cut off: answered, never left hanging.
const readJson = (req, max = 10_000) => new Promise((resolve, reject) => {
  let data = "";
  let done = false;
  const fail = (status, message) => { if (!done) { done = true; reject(new FamilyError(status, message)); } };
  req.on("data", (c) => {
    data += c;
    if (data.length > max) { fail(413, "That request is too large."); req.pause(); }
  });
  req.on("end", () => { if (done) return; done = true; try { resolve(JSON.parse(data || "{}")); } catch { reject(new FamilyError(400, "That request isn’t valid JSON.")); } });
  req.on("error", () => fail(400, "The request was cut off."));
  req.on("aborted", () => fail(400, "The request was cut off."));
});

// Chat queues. One message at a time per purse (two taps can't race a payment). Purses still on the
// shared agent wallet also share one wallet queue (their payment holds depend on it); a family with
// its own wallet never waits for another family.
const forPurse = (purseId, fn) => {
  const own = purses.get(purseId)?.agent?.address;
  return own ? inOrder(`purse:${purseId}`, fn) : inOrder("wallet:shared", () => inOrder(`purse:${purseId}`, fn));
};

// Background: settle any open order every minute, in that purse's queue, so a stuck order never
// waits for Mama's next message (and never blocks other families on the shared wallet).
setInterval(() => {
  for (const p of purses.all?.() ?? []) {
    if (!p.openOrder) continue;
    forPurse(p.id, () => currentPurse.run(p.id, () => mhasibu.settle(p.id))).catch((err) => emit({ purse: p.id, type: "error", message: `background settle: ${err.message}` }));
  }
}, 60_000).unref();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  // Public: status only (public keys and settings, nothing about Mama). Everything else needs the key.
  // HEAD on /v1/status is for uptime monitors (UptimeRobot checks with HEAD): headers only, no body.
  if (req.method === "HEAD" && url.pathname === "/v1/status") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end();
  }
  if (!(req.method === "GET" && url.pathname === "/v1/status") && !authorised(req)) return send(res, 401, { error: "unauthorised" });
  try {
    if (req.method === "GET" && url.pathname === "/v1/status") {
      return send(res, 200, {
        phase: config.purseContractId ? 2 : 1,
        understander: mhasibu.understander,
        network: config.network,
        purseContract: config.purseContractId || null,
        purseContractLink: config.purseContractId ? `${config.explorerUrl}/contract/${config.purseContractId}` : null,
        agent: agentAddress,
        gateway: config.gatewayUrl,
        rate: config.rate,
        demoMode,
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/history") {
      const purse = purses.get(url.searchParams.get("purse") ?? "demo");
      if (!purse) return send(res, 404, { error: "no such purse" });
      return send(res, 200, { mama: { name: purse.mama.name, language: purse.mama.language }, guardian: purse.guardian.name, history: purse.history.slice(-50) });
    }
    // Mama's purchase history for her Purchases page, newest first. Face value only: the service
    // fee is her daughter's and is never shown to Mama.
    if (req.method === "GET" && url.pathname === "/v1/purchases") {
      const purse = purses.get(url.searchParams.get("purse") ?? "demo");
      if (!purse) return send(res, 404, { error: "no such purse" });
      const purchases = [...purse.spends].reverse().slice(0, 200).map((s) => ({
        at: s.at,
        utility: s.utility,
        ngn: s.ngn,
        to: s.utility === "electricity" ? purse.destinations.electricity : purse.destinations[s.utility] ?? purse.mama.phone,
        token: s.utility === "electricity" ? s.token ?? null : null,
        units: s.units ?? null,
        status: s.unconfirmed ? "checking" : "done",
        link: s.tx ? explorer.tx(s.tx) : null,
      }));
      return send(res, 200, { mama: { name: purse.mama.name }, purchases });
    }
    // Mama's electricity tokens, newest first: the chat pins the latest one so it never scrolls away.
    if (req.method === "GET" && url.pathname === "/v1/tokens") {
      const purse = purses.get(url.searchParams.get("purse") ?? "demo");
      if (!purse) return send(res, 404, { error: "no such purse" });
      const tokens = purse.spends.filter((s) => s.utility === "electricity" && s.token).reverse().slice(0, 10)
        .map((s) => ({ at: s.at, ngn: s.ngn, token: s.token, units: s.units ?? null, meter: purse.destinations.electricity, copied: Boolean(s.copiedAt) }));
      return send(res, 200, { tokens });
    }
    // Mama copied a token: remembered with the purchase, so it stays out of the way on every phone.
    if (req.method === "POST" && url.pathname === "/v1/tokens/seen") {
      const { purse: id = "demo", at, token } = await readJson(req);
      const purse = purses.get(id);
      if (!purse) return send(res, 404, { error: "no such purse" });
      const spend = purse.spends.find((s) => s.at === at && s.token === token);
      if (!spend) return send(res, 404, { error: "no such token" });
      purses.update(id, () => { spend.copiedAt = spend.copiedAt ?? new Date().toISOString(); });
      await purses.flush?.();
      return send(res, 200, { copied: true });
    }
    if (req.method === "GET" && url.pathname === "/v1/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write(": connected\n\n");
      clients.set(res, url.searchParams.get("purse") ?? "demo");
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/chat") {
      const { purse = "demo", text, cid } = await readJson(req);
      if (typeof text !== "string" || !text.trim()) return send(res, 400, { error: "text is required" });
      if (!purses.get(purse)) return send(res, 404, { error: "no such purse" });
      if (tooMany(`chat:${purse}`, 30, 60_000)) return send(res, 429, { error: "That’s a lot of messages. Please wait a minute." });
      const reply = await forPurse(purse, () => currentPurse.run(purse, () => mhasibu.handle(purse, text.trim().slice(0, 500), { cid })));
      return send(res, 200, { reply });
    }
    // ── Sign-up (the daughter) ──────────────────────────────────
    if (req.method === "POST" && url.pathname === "/v1/meters/verify") {
      const { meter, disco } = await readJson(req);
      return send(res, 200, await families.checkMeter(meter, disco));
    }
    if (req.method === "GET" && url.pathname === "/v1/family") {
      return send(res, 200, await families.dashboard({ privyId: url.searchParams.get("privyId") }));
    }
    if (req.method === "GET" && url.pathname === "/v1/family/activity") {
      const q = url.searchParams;
      return send(res, 200, families.activity({ privyId: q.get("privyId"), utility: q.get("utility") || undefined, offset: q.get("offset"), limit: q.get("limit") }));
    }
    if (req.method === "POST" && url.pathname === "/v1/family/prepare") return send(res, 200, await families.prepare(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/complete") return send(res, 200, await families.complete(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/limits/prepare") return send(res, 200, await families.prepareLimits(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/limits/complete") return send(res, 200, await families.completeLimits(await readJson(req)));
    if (req.method === "GET" && url.pathname === "/v1/family/profile") return send(res, 200, families.profile({ privyId: url.searchParams.get("privyId") }));
    if (req.method === "POST" && url.pathname === "/v1/family/profile") return send(res, 200, await families.updateProfile(await readJson(req, 100_000))); // a small photo
    if (req.method === "POST" && url.pathname === "/v1/family/delete") return send(res, 200, await families.deleteAccount(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/pause") return send(res, 200, await families.preparePause(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/withdraw") return send(res, 200, await families.prepareWithdraw(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/agent") return send(res, 200, await families.prepareAgentMove(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/destinations") return send(res, 200, await families.prepareDestinations(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/action/cancel") return send(res, 200, await families.cancelApproval(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/action/complete") return send(res, 200, await families.completeAction(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/test-usdc") return send(res, 200, await families.testUsdc(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/notifications/read") return send(res, 200, await families.readNotifications(await readJson(req)));
    if (req.method === "POST" && url.pathname === "/v1/family/invite") return send(res, 200, await families.sendNewInvite(await readJson(req)));
    // ── Mama's invite and sign-in ───────────────────────────────
    const inv = url.pathname.match(/^\/v1\/invites\/([A-Za-z0-9_-]{16,64})(\/code|\/verify)?$/);
    if (inv && req.method === "GET" && !inv[2]) return send(res, 200, families.invite(inv[1]));
    if (inv && req.method === "POST" && inv[2] === "/code") { const { phone } = await readJson(req); return send(res, 200, await families.sendCode(inv[1], phone)); }
    if (inv && req.method === "POST" && inv[2] === "/verify") { const { phone, code } = await readJson(req); return send(res, 200, await families.verifyCode(inv[1], phone, code)); }
    if (req.method === "POST" && url.pathname === "/v1/sessions/resolve") {
      const { session, privyId } = await readJson(req);
      return send(res, 200, { purseId: session ? families.sessionPurse(session) : families.guardianPurse(privyId) });
    }
    if (req.method === "POST" && url.pathname === "/v1/demo/overspend") {
      if (!demoMode) return send(res, 404, { error: "demo mode is off" });
      if (tooMany("demo:overspend", 1, 15_000)) return send(res, 429, { error: "One try every 15 seconds." });
      if (!config.purseContractId) return send(res, 409, { error: "no purse contract deployed" });
      // A fixed amount, never from the request: one base unit over the on-chain per-top-up cap,
      // so the contract must refuse it. If it ever didn't, refund that order straight away.
      const soroban = createSoroban({ rpcUrl: config.rpcUrl });
      const agent = Keypair.fromSecret(config.agentSecret);
      const caps = await soroban.read(config.purseContractId, "caps", [symbol("electricity")], agent.publicKey());
      if (!caps) return send(res, 409, { error: "no electricity cap set" });
      const amount = BigInt(caps.per_topup) + 1n;
      const purse = purses.get("demo");
      const orderId = `overspend-${Date.now()}`;
      emit({ purse: "demo", type: "attack", usdc: Number(amount) / 1e7, text: `Bypassing Mhasibu's own rule checks: asking the purse contract for ${(Number(amount) / 1e7).toFixed(7)} USDC of electricity, just over Adaeze's cap` });
      try {
        const r = await soroban.invoke(agent, config.purseContractId, "buy",
          buyArgs({ utility: "electricity", destination: purse.destinations.electricity, amount, orderId, key: config.destHashKey, contractId: config.purseContractId }));
        emit({ purse: "demo", type: "contract-ok", tx: r.hash, text: "The contract allowed it (it shouldn't): refunding now" });
        const back = await soroban.invoke(agent, config.purseContractId, "refund", refundArgs(orderId));
        emit({ purse: "demo", type: "refunded", tx: back.hash, amount: String(amount) });
        return send(res, 200, { refused: false, tx: r.hash, refunded: back.hash });
      } catch (err) {
        if (!(err instanceof ContractRefused)) throw err;
        emit({ purse: "demo", type: "contract-refused", rule: err.rule, code: err.code });
        return send(res, 200, { refused: true, rule: err.rule, code: err.code });
      }
    }
    if (req.method === "POST" && url.pathname === "/v1/demo/wrong-destination") {
      if (!demoMode) return send(res, 404, { error: "demo mode is off" });
      if (tooMany("demo:wrong-destination", 1, 15_000)) return send(res, 429, { error: "One try every 15 seconds." });
      if (!config.purseContractId) return send(res, 409, { error: "no purse contract deployed" });
      const purse = purses.get("demo");
      if (!purse) return send(res, 409, { error: "no demo purse" });

      // Fixed on the server, never taken from the request. Pick a valid-looking meter that is not
      // Adaeze's saved meter, then ask for one base unit. Destination is checked before money moves.
      const wrongMeter = purse.destinations.electricity === "2222222222222" ? "3333333333333" : "2222222222222";
      const amount = 1n;
      const orderId = `wrong-destination-${Date.now()}`;
      const soroban = createSoroban({ rpcUrl: config.rpcUrl });
      const agent = Keypair.fromSecret(config.agentSecret);
      emit({ purse: "demo", type: "attack", kind: "wrong-destination", text: `Bypassing Mhasibu's own checks: asking the purse contract to pay unsaved meter ${wrongMeter}` });
      try {
        const r = await soroban.invoke(agent, config.purseContractId, "buy",
          buyArgs({ utility: "electricity", destination: wrongMeter, amount, orderId, key: config.destHashKey, contractId: config.purseContractId }));
        emit({ purse: "demo", type: "contract-ok", tx: r.hash, text: "The contract allowed the unsaved meter (it shouldn't): refunding now" });
        const back = await soroban.invoke(agent, config.purseContractId, "refund", refundArgs(orderId));
        emit({ purse: "demo", type: "refunded", tx: back.hash, amount: String(amount) });
        return send(res, 200, { refused: false, tx: r.hash, refunded: back.hash });
      } catch (err) {
        if (!(err instanceof ContractRefused)) throw err;
        emit({ purse: "demo", type: "contract-refused", kind: "wrong-destination", rule: err.rule, code: err.code });
        return send(res, 200, { refused: true, rule: err.rule, code: err.code });
      }
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    // Sign-up and sign-in rules answer with their own message and status (wrong code, expired link).
    if (err instanceof FamilyError) return send(res, err.status, { error: err.message });
    emit({ type: "error", message: err.message });
    send(res, 500, { error: "Mhasibu could not finish that. Try again." });
  }
});

server.listen(port, () => console.log(`Mhasibu API on http://localhost:${port} · ${mhasibu.understander} · phase ${config.purseContractId ? 2 : 1}${demoMode ? " · demo mode" : ""}`));

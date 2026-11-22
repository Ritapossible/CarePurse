// The web app's relay rules: which purse each request may touch, and who may sign up as guardian.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, guardianCheck, pin } from "../src/lib/server/relay-policy.ts";

const base = { mamaPurse: null, codeOk: false, accessCodeSet: true, production: true };

test("Mama's session pins every chat route to her own purse", () => {
  for (const route of ["GET v1/history", "GET v1/tokens", "GET v1/purchases", "GET v1/events", "POST v1/chat", "POST v1/tokens/seen"]) {
    assert.deepEqual(decide({ ...base, route, mamaPurse: "p_mama" }), { ok: true, purse: "p_mama" }, route);
  }
});

test("a purse the browser names is ignored: the decided purse wins, in the query and the body", () => {
  const q = new URLSearchParams({ purse: "p_someone_else", code: "secret", offset: "20" });
  const get = pin("GET v1/history", "p_mama", q, null);
  assert.equal(get.query.get("purse"), "p_mama");
  assert.equal(get.query.get("code"), null); // the access code never goes upstream
  assert.equal(get.query.get("offset"), "20");
  const post = pin("POST v1/chat", "p_mama", new URLSearchParams(), { purse: "p_someone_else", text: "hi" });
  assert.deepEqual(JSON.parse(post.body!), { purse: "p_mama", text: "hi" });
});

test("the demo needs the access code; without one set in production it is closed", () => {
  assert.deepEqual(decide({ ...base, route: "POST v1/chat" }), { ok: false, status: 401, error: "access code needed" });
  assert.deepEqual(decide({ ...base, route: "POST v1/chat", codeOk: true }), { ok: true, purse: "demo" });
  const closed = decide({ ...base, route: "POST v1/chat", accessCodeSet: false });
  assert.equal(closed.ok, false);
  assert.equal(!closed.ok && closed.status, 503);
  assert.deepEqual(decide({ ...base, route: "POST v1/chat", accessCodeSet: false, production: false }), { ok: true, purse: "demo" }); // local development
});

test("Mama can't press the demo's attack buttons; unknown routes don't exist; status is public", () => {
  assert.equal(decide({ ...base, route: "POST v1/demo/overspend", mamaPurse: "p_mama" }).ok, false); // she has no access code
  assert.deepEqual(decide({ ...base, route: "POST v1/demo/overspend", mamaPurse: "p_mama", codeOk: true }), { ok: true, purse: "demo" });
  for (const route of ["POST v1/family/withdraw", "GET v1/family", "POST v1/invites/x/verify", "DELETE v1/chat"]) {
    assert.deepEqual(decide({ ...base, route, codeOk: true }), { ok: false, status: 404, error: "not found" }, route);
  }
  assert.deepEqual(decide({ ...base, route: "GET v1/status" }), { ok: true, purse: null });
});

test("sign-up: the guardian address must be one of her own Privy wallets", () => {
  assert.equal(guardianCheck({ wallets: ["GHERS"] }, "GHERS").ok, true);
  const other = guardianCheck({ wallets: ["GHERS"] }, "GSOMEONEELSE");
  assert.equal(!other.ok && other.status, 403);
  const down = guardianCheck(null, "GHERS");
  assert.equal(!down.ok && down.status, 502);
  assert.equal(guardianCheck({ wallets: [] }, undefined).ok, false);
});

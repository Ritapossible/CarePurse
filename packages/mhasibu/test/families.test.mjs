// Sign-up, invites and Mama's sign-in, offline: a fake signer stands in for Stellar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPurseStore } from "../src/purses.mjs";
import { createFamilies, normalisePhone } from "../src/families.mjs";

const NOW = Date.parse("2026-11-16T09:00:00Z");
const GUARDIAN = { privyId: "did:privy:adaeze", address: "GADAEZE", name: "Adaeze", email: "a@example.com" };
const SIGNUP = { mama: { name: "Ngozi", phone: "+234 803 123 4567", language: "pcm" }, meter: "45012345678" };

function setup() {
  let clock = NOW;
  const calls = [];
  const trusted = new Set();
  const signup = {
    prepareSetup: async ({ guardianAddress, destinations }) => { calls.push(["prepare", guardianAddress, destinations]); return { contractId: "CPURSE", hash: "ab".repeat(32), entry: "x", validUntil: 1, method: "configure", args: [] }; },
    completeGuardianCall: async (pending, address, sig) => { if (sig !== "0xgood") throw new Error("signature doesn't match payload"); calls.push(["complete", address]); return { hash: "txhash" }; },
    sendTestUsdc: async (contractId, usdc) => { calls.push(["usdc", contractId, usdc]); return { tx: "fund" }; },
    purseBalance: async () => 10,
    prepareGuardianCall: async ({ method, args }) => { calls.push(["call", method, args.length]); return { hash: "ef".repeat(32), method }; },
    prepareWithdraw: async ({ to, usdc }) => { calls.push(["withdraw", to, usdc]); return { hash: "aa".repeat(32), method: "withdraw" }; },
    hasUsdcTrustline: async (address) => trusted.has(address),
    prepareTrustline: async (address) => { calls.push(["trustline", address]); return { kind: "trustline", hash: "bb".repeat(32), xdr: "x" }; },
    completeTrustline: async (pending, address, sig) => { if (sig !== "0xgood") throw new Error("signature does not match"); trusted.add(address); return { hash: "trusttx" }; },
    prepareLimits: async ({ limits, destinations }) => { calls.push(["limits", limits.electricity.perTopup, destinations]); return { hash: "cd".repeat(32), entry: "y", validUntil: 1, method: "configure", args: [] }; },
  };
  const purses = createPurseStore(null, { seed: false });
  const families = createFamilies({ purses, signup, config: { ngnPerUsdc: 1470, showMamaCode: true }, verifyMeter: async () => ({ ok: true, ownerName: "NGOZI OKAFOR" }), clock: () => clock });
  return { families, purses, calls, tick: (ms) => { clock += ms; } };
}

test("phone numbers are normalised to the 0XXXXXXXXXX form", () => {
  assert.equal(normalisePhone("+234 803 123 4567"), "08031234567");
  assert.equal(normalisePhone("0803-123-4567"), "08031234567");
  assert.equal(normalisePhone("8031234567"), "08031234567");
  assert.equal(normalisePhone("12345"), null);
});

test("sign-up: one signature activates the purse; a wrong one doesn't", async () => {
  const { families, purses, calls } = setup();
  await assert.rejects(families.prepare({ ...SIGNUP, guardian: null }), /sign in first/);
  const prep = await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" });
  assert.equal(prep.status, "pending");
  assert.deepEqual(calls[0][2], { electricity: "45012345678", airtime: "08031234567", data: "08031234567" });
  await assert.rejects(families.complete({ privyId: GUARDIAN.privyId, signature: "0xbad" }), /didn’t match/);
  const done = await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  assert.equal(done.status, "active");
  assert.ok(done.invite.length > 20);
  const p = purses.get(prep.purseId);
  assert.equal(p.contractId, "CPURSE");
  assert.equal(p.guardian.address, "GADAEZE");
  assert.equal(p.invite.hash.length, 64); // only the hash is stored
  assert.notEqual(p.invite.hash, done.invite);
  // Signing up again returns the same purse, it doesn't make a second one.
  assert.equal((await families.prepare({ ...SIGNUP, guardian: GUARDIAN })).purseId, prep.purseId);
});

test("Mama: code only for her number, invite works once, sessions map to her purse only", async () => {
  const { families, tick } = setup();
  const { purseId } = await families.prepare({ ...SIGNUP, guardian: GUARDIAN });
  const { invite } = await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  assert.equal(families.invite(invite).phone, "08031234567");
  await assert.rejects(families.sendCode(invite, "08099999999"), /isn’t the number/);
  const { code } = await families.sendCode(invite, "0803 123 4567");
  assert.match(code, /^\d{6}$/);
  await assert.rejects(families.verifyCode(invite, "08031234567", code === "000000" ? "111111" : "000000"), /isn’t right/);
  const { session, purseId: joined } = await families.verifyCode(invite, "08031234567", code);
  assert.equal(joined, purseId);
  assert.equal(families.sessionPurse(session), purseId);
  assert.equal(families.sessionPurse("someone-elses-token"), null);
  await assert.rejects(families.verifyCode(invite, "08031234567", code), /already used/);
  const dash = await families.dashboard({ privyId: GUARDIAN.privyId });
  assert.equal(dash.purse.invite.status, "joined");
  assert.equal(dash.purse.balanceNgn, 14700);
  // Codes expire after 10 minutes.
  const second = (await families.sendNewInvite({ privyId: GUARDIAN.privyId })).invite;
  const c2 = (await families.sendCode(second, "08031234567")).code;
  tick(11 * 60_000);
  await assert.rejects(families.verifyCode(second, "08031234567", c2), /expired/);
});

test("a new invite cancels the old one, and invites expire after 7 days", async () => {
  const { families, tick } = setup();
  await families.prepare({ ...SIGNUP, guardian: GUARDIAN });
  const { invite: first } = await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  const { invite: second } = await families.sendNewInvite({ privyId: GUARDIAN.privyId });
  assert.throws(() => families.invite(first), /isn’t valid/);
  assert.equal(families.invite(second).mamaName, "Ngozi");
  tick(8 * 86_400_000);
  assert.throws(() => families.invite(second), /expired/);
  assert.equal((await families.dashboard({ privyId: GUARDIAN.privyId })).purse.invite.status, "expired");
});

test("test USDC: only after set-up, at most three times", async () => {
  const { families, calls } = setup();
  await families.prepare({ ...SIGNUP, guardian: GUARDIAN });
  await assert.rejects(families.testUsdc({ privyId: GUARDIAN.privyId }), /finish setting up/);
  await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  for (let i = 0; i < 3; i++) await families.testUsdc({ privyId: GUARDIAN.privyId });
  await assert.rejects(families.testUsdc({ privyId: GUARDIAN.privyId }), /enough test USDC/);
  assert.equal(calls.filter((c) => c[0] === "usdc").length, 3);
});

test("she can change the plan later (Standard → Light): new caps on-chain first, with her signature", async () => {
  const { families, purses, calls } = setup();
  await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" });
  const { purseId } = await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  assert.equal((await families.prepareLimits({ privyId: GUARDIAN.privyId, preset: "standard" })).status, "pending"); // re-save at today's rate

  const prep = await families.prepareLimits({ privyId: GUARDIAN.privyId, preset: "light" });
  assert.equal(prep.status, "pending");
  assert.deepEqual(calls.at(-1)[2], { electricity: "45012345678", airtime: "08031234567", data: "08031234567" }); // same saved payees
  assert.equal(purses.get(purseId).preset, "standard"); // nothing changes before she signs

  await assert.rejects(families.completeLimits({ privyId: GUARDIAN.privyId, signature: "0xbad" }), /didn’t match/);
  assert.equal(purses.get(purseId).preset, "standard");
  const done = await families.completeLimits({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  assert.equal(done.preset, "light");
  assert.equal(purses.get(purseId).preset, "light");
  assert.equal(purses.get(purseId).monthlyCap, 50_000);
  await assert.rejects(families.completeLimits({ privyId: GUARDIAN.privyId, signature: "0xgood" }), /start again/);
});

test("pause and resume the purse, each with her signature", async () => {
  const { families, purses, calls } = setup();
  await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" });
  const { purseId } = await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  const prep = await families.preparePause({ privyId: GUARDIAN.privyId, paused: true });
  assert.equal(prep.kind, "pause");
  assert.deepEqual(calls.at(-1), ["call", "pause", 0]);
  assert.equal(purses.get(purseId).paused, false); // not before she signs
  await families.completeAction({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  assert.equal(purses.get(purseId).paused, true);
  await families.preparePause({ privyId: GUARDIAN.privyId, paused: false });
  await families.completeAction({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  assert.equal(purses.get(purseId).paused, false);
});

test("withdraw: to her own wallet (one-time USDC opt-in first), checked against the balance", async () => {
  const { families, purses, calls } = setup();
  await families.prepare({ ...SIGNUP, guardian: { ...GUARDIAN, address: "GADAEZE".padEnd(56, "A") }, preset: "standard" });
  const { purseId } = await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  const me = "GADAEZE".padEnd(56, "A");
  await assert.rejects(families.prepareWithdraw({ privyId: GUARDIAN.privyId, usdc: 50 }), /The purse has 10 USDC/);
  await assert.rejects(families.prepareWithdraw({ privyId: GUARDIAN.privyId, usdc: 1, to: "not-an-address" }), /isn’t a Stellar address/);
  await assert.rejects(families.prepareWithdraw({ privyId: GUARDIAN.privyId, usdc: 1, to: "GOTHER".padEnd(56, "B") }), /can’t receive USDC yet/);

  const first = await families.prepareWithdraw({ privyId: GUARDIAN.privyId, usdc: 4 });
  assert.equal(first.kind, "trustline"); // her wallet opts in to USDC first
  const second = await families.completeAction({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  assert.equal(second.kind, "withdraw"); // then the withdrawal, for her second approval
  assert.deepEqual(calls.at(-1), ["withdraw", me, 4]);
  const done = await families.completeAction({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  assert.equal(done.kind, "withdraw");
  assert.deepEqual(purses.get(purseId).withdrawals.map((w) => [w.usdc, w.to]), [[4, me]]);

  // Next time her wallet already holds USDC: one approval only
  assert.equal((await families.prepareWithdraw({ privyId: GUARDIAN.privyId, usdc: 1 })).kind, "withdraw");
});

test("a pending sign-up is reused (no new contract on every click), with a daily cap", async () => {
  const { families, calls, tick } = setup();
  const a = await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" });
  const b = await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" });
  assert.equal(a.hash, b.hash);
  assert.equal(calls.filter((c) => c[0] === "prepare").length, 1);
  for (let i = 0; i < 4; i++) { tick(10 * 60_000); await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" }); }
  assert.equal(calls.filter((c) => c[0] === "prepare").length, 5);
  tick(10 * 60_000);
  await assert.rejects(families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" }), /Too many set-up attempts/);
});

test("Mama's sessions end after 30 days, and a new invite signs her out everywhere", async () => {
  const { families, tick } = setup();
  await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" });
  const { invite, purseId } = await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  const sent = await families.sendCode(invite, "08031234567");
  const { session } = await families.verifyCode(invite, "08031234567", sent.code);
  assert.equal(families.sessionPurse(session), purseId);
  await families.sendNewInvite({ privyId: GUARDIAN.privyId });
  assert.equal(families.sessionPurse(session), null);
});

test("account: profile name and photo, and deleting only once the purse is empty", async () => {
  const { families, purses } = setup();
  await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" });
  const { purseId } = await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  const photo = "data:image/jpeg;base64," + "A".repeat(100);
  const r = await families.updateProfile({ privyId: GUARDIAN.privyId, name: "  Rita ", avatar: photo });
  assert.equal(r.profile.name, "Rita");
  assert.equal(r.profile.avatar, photo);
  await assert.rejects(families.updateProfile({ privyId: GUARDIAN.privyId, avatar: "data:text/html;base64,AAAA" }), /JPEG, PNG or WebP/);
  await assert.rejects(families.updateProfile({ privyId: GUARDIAN.privyId, avatar: "data:image/png;base64," + "A".repeat(90_000) }), /too large/);
  assert.equal((await families.updateProfile({ privyId: GUARDIAN.privyId, avatar: null })).profile.avatar, null);

  await assert.rejects(families.deleteAccount({ privyId: GUARDIAN.privyId }), /still holds 10 USDC/); // fake balance: 10
  assert.ok(purses.get(purseId));
});

test("account: an empty purse is deleted for good, with Mama's access", async () => {
  const { families, purses } = setup();
  await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" });
  const { purseId, invite } = await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  const sent = await families.sendCode(invite, "08031234567");
  const { session } = await families.verifyCode(invite, "08031234567", sent.code);
  purses.update(purseId, () => {});
  const signup = { purseBalance: async () => 0 };
  // same families, balance 0
  const { createFamilies } = await import("../src/families.mjs");
  const f2 = createFamilies({ purses, signup, config: { ngnPerUsdc: 1470 }, verifyMeter: async () => ({ ok: true }) });
  assert.deepEqual(await f2.deleteAccount({ privyId: GUARDIAN.privyId }), { deleted: true });
  assert.equal(purses.get(purseId), null);
  assert.equal(f2.sessionPurse(session), null);
  assert.equal(families.profile({ privyId: GUARDIAN.privyId }).profile, null);
});

test("activity: her full history, newest first, a page at a time, filterable", async () => {
  const { families, purses } = setup();
  const prep = await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" });
  await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  purses.update(prep.purseId, (p) => {
    for (let i = 0; i < 25; i++) p.spends.push({ at: new Date(NOW + i * 60_000).toISOString(), utility: i % 5 === 0 ? "airtime" : "electricity", ngn: 1000, chargedNgn: 1030, feeNgn: 30 });
  });
  const first = families.activity({ privyId: GUARDIAN.privyId });
  assert.equal(first.items.length, 20);
  assert.equal(first.total, 25);
  assert.equal(first.nextOffset, 20);
  assert.ok(first.items[0].at > first.items[1].at); // newest first
  assert.deepEqual(first.totals, { ngn: 25_000, chargedNgn: 25_750, feeNgn: 750 });
  const second = families.activity({ privyId: GUARDIAN.privyId, offset: 20 });
  assert.equal(second.items.length, 5);
  assert.equal(second.nextOffset, null);
  const airtime = families.activity({ privyId: GUARDIAN.privyId, utility: "airtime" });
  assert.equal(airtime.total, 5);
  assert.ok(airtime.items.every((s) => s.utility === "airtime"));
  assert.throws(() => families.activity({ privyId: GUARDIAN.privyId, utility: "gas" }), /unknown utility/);
  assert.throws(() => families.activity({ privyId: "someone-else" }), /no purse/);
});

test("account: delete waits until a signed payment's hold has ended", async () => {
  const { families, purses, tick } = setup();
  await families.prepare({ ...SIGNUP, guardian: GUARDIAN, preset: "standard" });
  const { purseId } = await families.complete({ privyId: GUARDIAN.privyId, signature: "0xgood" });
  const { createFamilies } = await import("../src/families.mjs");
  let clock = NOW;
  const f2 = createFamilies({ purses, signup: { purseBalance: async () => 0 }, config: { ngnPerUsdc: 1470 }, verifyMeter: async () => ({ ok: true }), clock: () => clock });
  purses.update(purseId, (p) => { p.payHoldUntil = new Date(NOW + 90_000).toISOString(); });
  await assert.rejects(f2.deleteAccount({ privyId: GUARDIAN.privyId }), /Try again in 2 minutes/);
  assert.ok(purses.get(purseId)); // the hold is still on record
  clock += 91_000;
  assert.deepEqual(await f2.deleteAccount({ privyId: GUARDIAN.privyId }), { deleted: true });
  void tick;
});

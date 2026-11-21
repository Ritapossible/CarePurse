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
  const signup = {
    prepareSetup: async ({ guardianAddress, destinations }) => { calls.push(["prepare", guardianAddress, destinations]); return { contractId: "CPURSE", hash: "ab".repeat(32), entry: "x", validUntil: 1, method: "configure", args: [] }; },
    completeGuardianCall: async (pending, address, sig) => { if (sig !== "0xgood") throw new Error("signature doesn't match payload"); calls.push(["complete", address]); return { hash: "txhash" }; },
    sendTestUsdc: async (contractId, usdc) => { calls.push(["usdc", contractId, usdc]); return { tx: "fund" }; },
    purseBalance: async () => 10,
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
  assert.equal((await families.prepareLimits({ privyId: GUARDIAN.privyId, preset: "standard" })).status, "same");

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

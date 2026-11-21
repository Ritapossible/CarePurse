// Families: the daughter's sign-up, Mama's invite and her sign-in. Rules from SIGNUP.md:
//   - One guardian per purse, one purse per Mama (and per daughter, for the MVP).
//   - The invite works once and expires after 7 days. A new invite cancels the old one.
//   - Mama's code is for the phone number the daughter entered; a forwarded link isn't enough.
//   - Codes are 6 digits, valid 10 minutes, 5 tries. Sessions are random 32-byte tokens.
//   - Tokens, codes and sessions are stored only as sha256 hashes.
// Callers are trusted: the web app's server verifies the daughter's Privy login (privyId) and
// Mama's session before it reaches this, and Mhasibu's API needs its key.
import crypto from "node:crypto";
import { PRESETS, monthlyCap, periodStart, spentSince } from "./limits.mjs";
import { newPurse } from "./purses.mjs";

const DAY = 86_400_000;
const INVITE_DAYS = 7;
const CODE_MINUTES = 10;
const CODE_TRIES = 5;
const TEST_USDC = 10;
const TEST_USDC_TIMES = 3;

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const token = () => crypto.randomBytes(24).toString("base64url");

export class FamilyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Nigerian mobile numbers in the form the gateway and VTpass use: 0 + 10 digits.
export function normalisePhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("234")) d = `0${d.slice(3)}`;
  if (d.length === 10 && /^[789]/.test(d)) d = `0${d}`;
  return /^0[789][01]\d{8}$/.test(d) ? d : null;
}

export function createFamilies({ purses, signup, config, verifyMeter, clock = () => Date.now() }) {
  const now = () => clock();
  const iso = (t = now()) => new Date(t).toISOString();
  const all = () => purses.all();
  const byGuardian = (privyId) => all().find((p) => p.guardian?.privyId && p.guardian.privyId === privyId) ?? null;
  const mine = (privyId) => {
    const p = byGuardian(privyId);
    if (!p) throw new FamilyError(404, "no purse yet");
    return p;
  };

  function inviteStatus(p) {
    const inv = p.invite;
    if (!inv) return "none";
    if (inv.usedAt) return "joined";
    if (Date.parse(inv.expiresAt) < now()) return "expired";
    return "waiting";
  }

  function newInvite(purseId) {
    const t = token();
    purses.update(purseId, (p) => {
      p.invite = { hash: sha(t), createdAt: iso(), expiresAt: iso(now() + INVITE_DAYS * DAY), usedAt: null };
      p.mamaCode = null;
    });
    return t;
  }

  // D3: the meter's owner, so she can confirm it's Mama's.
  async function checkMeter(meter, disco) {
    const m = String(meter ?? "").replace(/\D/g, "");
    if (!/^\d{11,13}$/.test(m)) throw new FamilyError(400, "A meter number has 11 to 13 digits.");
    return verifyMeter(m, disco);
  }

  // D1 to D4, step 1: create the family's purse and its contract, and return the hash to sign.
  async function prepare({ guardian, mama, meter, disco = "ikeja-electric", network = "mtn", preset = "standard" }) {
    if (!guardian?.privyId || !guardian?.address) throw new FamilyError(401, "sign in first");
    const existing = byGuardian(guardian.privyId);
    if (existing?.setup?.status === "active") return { purseId: existing.id, status: "active" };
    const phone = normalisePhone(mama?.phone);
    if (!phone) throw new FamilyError(400, "Mama’s phone number should look like 0803 123 4567.");
    const name = String(mama?.name ?? "").trim().slice(0, 40);
    if (!name) throw new FamilyError(400, "Add Mama’s name.");
    const m = String(meter ?? "").replace(/\D/g, "");
    if (!/^\d{11,13}$/.test(m)) throw new FamilyError(400, "A meter number has 11 to 13 digits.");
    if (!PRESETS[preset]) throw new FamilyError(400, "Pick Light or Standard.");
    const language = mama?.language === "pcm" ? "pcm" : "en";
    const destinations = { electricity: m, airtime: phone, data: phone };
    const limits = PRESETS[preset];

    // A sign-up that wasn't finished (closed the tab, signature expired): start it again with a
    // new purse contract, so the rules always come from one signature.
    const id = existing?.id ?? `p_${crypto.randomBytes(6).toString("hex")}`;
    const pending = await signup.prepareSetup({ guardianAddress: guardian.address, limits, destinations });
    const purse = newPurse({
      id,
      mama: { name, phone, language },
      guardian: { name: String(guardian.name ?? "").trim().slice(0, 40) || "Your child", email: guardian.email ?? null, privyId: guardian.privyId, address: guardian.address },
      destinations,
      providers: { disco, network },
      preset,
      contractId: pending.contractId,
    });
    purse.setup = { status: "pending", createdAt: iso(), pending };
    purse.testUsdc = 0;
    purses.put(purse);
    await purses.flush?.();
    return { purseId: id, status: "pending", contractId: pending.contractId, hash: pending.hash };
  }

  // Step 2: her Privy signature arrives. Submit, activate, create Mama's first invite.
  async function complete({ privyId, signature }) {
    const p = mine(privyId);
    if (p.setup?.status === "active") return { purseId: p.id, status: "active" };
    const pending = p.setup?.pending;
    if (!pending) throw new FamilyError(409, "start again");
    const done = await signup.completeGuardianCall(pending, p.guardian.address, signature).catch((err) => {
      throw new FamilyError(400, /does not match|signature/.test(err.message) ? "That signature didn’t match. Please try again." : `Could not save the rules on Stellar (${err.message.slice(0, 80)})`);
    });
    purses.update(p.id, (x) => { x.setup = { status: "active", createdAt: x.setup.createdAt, activatedAt: iso(), tx: done.hash }; });
    const invite = newInvite(p.id);
    await purses.flush?.();
    return { purseId: p.id, status: "active", tx: done.hash, invite };
  }

  // Her plan can change any time (Light ↔ Standard), or be re-saved at today's rate. Step 1: the new rules, as one `configure`
  // call for her signature. Nothing changes until she signs.
  async function prepareLimits({ privyId, preset }) {
    const p = mine(privyId);
    if (p.setup?.status !== "active") throw new FamilyError(409, "finish setting up first");
    if (!PRESETS[preset]) throw new FamilyError(400, "Pick Light or Standard.");
    // The same plan may be saved again: that rewrites the on-chain caps at today's naira rate.
    const pending = await signup.prepareLimits({ contractId: p.contractId, guardianAddress: p.guardian.address, limits: PRESETS[preset], destinations: p.destinations });
    purses.update(p.id, (x) => { x.limitsChange = { preset, pending, createdAt: iso() }; });
    await purses.flush?.();
    return { status: "pending", preset, hash: pending.hash };
  }

  // Step 2: her signature. On-chain first; Mhasibu's own copy of the limits follows only after.
  async function completeLimits({ privyId, signature }) {
    const p = mine(privyId);
    const change = p.limitsChange;
    if (!change?.pending) throw new FamilyError(409, "start again");
    const done = await signup.completeGuardianCall(change.pending, p.guardian.address, signature).catch((err) => {
      throw new FamilyError(400, /does not match|signature/.test(err.message) ? "That signature didn’t match. Please try again." : `Could not save the new limits on Stellar (${err.message.slice(0, 80)})`);
    });
    purses.update(p.id, (x) => {
      x.preset = change.preset;
      x.limits = PRESETS[change.preset];
      x.monthlyCap = monthlyCap(PRESETS[change.preset]);
      x.limitsChange = null;
      (x.notifications ??= []).push({ at: iso(), kind: "limits-changed", text: `Plan changed to ${change.preset === "light" ? "Light" : "Standard"} (tx ${done.hash}).` });
    });
    await purses.flush?.();
    return { status: "active", preset: change.preset, tx: done.hash };
  }

  async function testUsdc({ privyId }) {
    const p = mine(privyId);
    if (p.setup?.status !== "active") throw new FamilyError(409, "finish setting up first");
    if ((p.testUsdc ?? 0) >= TEST_USDC_TIMES) throw new FamilyError(429, "That’s enough test USDC for this purse.");
    const sent = await signup.sendTestUsdc(p.contractId, TEST_USDC);
    purses.update(p.id, (x) => { x.testUsdc = (x.testUsdc ?? 0) + 1; });
    await purses.flush?.();
    return { ...sent, usdc: TEST_USDC };
  }

  async function dashboard({ privyId }) {
    const p = byGuardian(privyId);
    if (!p) return { purse: null };
    const balanceUsdc = p.setup?.status === "active" ? await signup.purseBalance(p.contractId).catch(() => null) : null;
    return {
      purse: {
        id: p.id,
        status: p.setup?.status ?? "active",
        mama: p.mama,
        guardian: { name: p.guardian.name, address: p.guardian.address },
        destinations: p.destinations,
        preset: p.preset,
        limits: p.limits,
        monthlyCap: p.monthlyCap,
        contractId: p.contractId,
        balanceUsdc,
        balanceNgn: balanceUsdc == null ? null : Math.floor(balanceUsdc * config.ngnPerUsdc),
        // What Mama is told she has: face value after the daughter's service fee (as in Mhasibu's balance reply).
        spendableNgn: balanceUsdc == null ? null : Math.floor((balanceUsdc * config.ngnPerUsdc * 10_000) / (10_000 + (config.serviceFeeBps ?? 0))),
        feeBps: config.serviceFeeBps ?? 0,
        paused: p.paused,
        invite: { status: inviteStatus(p), expiresAt: p.invite?.expiresAt ?? null, usedAt: p.invite?.usedAt ?? null },
        spends: [...p.spends].reverse().slice(0, 20),
        monthNgn: spentSince(p.spends, periodStart("month", now())),
        rate: { ngnPerUsdc: config.ngnPerUsdc, asOf: config.rate?.asOf ?? null, live: Boolean(config.rate?.live) },
        notifications: [...(p.notifications ?? [])].reverse().slice(0, 20),
        testUsdcLeft: TEST_USDC_TIMES - (p.testUsdc ?? 0),
      },
    };
  }

  async function sendNewInvite({ privyId }) {
    const p = mine(privyId);
    if (p.setup?.status !== "active") throw new FamilyError(409, "finish setting up first");
    const t = newInvite(p.id);
    await purses.flush?.();
    return { invite: t };
  }

  function findInvite(t) {
    const h = sha(t);
    const p = all().find((x) => x.invite?.hash === h);
    if (!p) throw new FamilyError(404, "This link isn’t valid. Ask your child to send a new one.");
    if (p.invite.usedAt) throw new FamilyError(410, "This link was already used. Ask your child to send a new one.");
    if (Date.parse(p.invite.expiresAt) < now()) throw new FamilyError(410, "This link has expired. Ask your child to send a new one.");
    return p;
  }

  // M1: what the invite page shows (her phone is filled in).
  function invite(t) {
    const p = findInvite(t);
    return { mamaName: p.mama.name, guardianName: p.guardian.name, phone: p.mama.phone, language: p.mama.language };
  }

  // A 6-digit code for the number on the invite. No SMS in the hackathon build: shown on screen.
  async function sendCode(t, phoneRaw) {
    const p = findInvite(t);
    const phone = normalisePhone(phoneRaw);
    if (phone !== p.mama.phone) throw new FamilyError(403, "That isn’t the number your child entered.");
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    purses.update(p.id, (x) => { x.mamaCode = { hash: sha(`${p.id}:${code}`), expiresAt: iso(now() + CODE_MINUTES * 60_000), tries: 0 }; });
    await purses.flush?.();
    return config.showMamaCode ? { sent: true, code } : { sent: true };
  }

  async function verifyCode(t, phoneRaw, codeRaw) {
    const p = findInvite(t);
    if (normalisePhone(phoneRaw) !== p.mama.phone) throw new FamilyError(403, "That isn’t the number your child entered.");
    const c = p.mamaCode;
    if (!c || Date.parse(c.expiresAt) < now()) throw new FamilyError(410, "The code has expired. Tap Send code again.");
    if (c.tries >= CODE_TRIES) throw new FamilyError(429, "Too many tries. Tap Send code again.");
    if (sha(`${p.id}:${String(codeRaw ?? "").trim()}`) !== c.hash) {
      purses.update(p.id, (x) => { x.mamaCode.tries += 1; });
      await purses.flush?.();
      throw new FamilyError(401, "That code isn’t right. Please check and try again.");
    }
    const session = crypto.randomBytes(32).toString("base64url");
    const welcome = p.mama.language === "pcm"
      ? `Welcome Mama ${p.mama.name}. ${p.guardian.name} don set up CarePurse for you. Tell me when your light, airtime or data dey low.`
      : `Welcome Mama ${p.mama.name}. ${p.guardian.name} has set up CarePurse for you. Tell me when your light, airtime or data is low.`;
    purses.update(p.id, (x) => {
      x.invite.usedAt = iso();
      x.mamaCode = null;
      x.mamaSessions = [...(x.mamaSessions ?? []).slice(-4), { hash: sha(session), createdAt: iso() }];
      x.history.push({ at: iso(), from: "mhasibu", text: welcome });
      x.notifications = [...(x.notifications ?? []), { at: iso(), kind: "joined", text: `Mama ${p.mama.name} joined CarePurse.` }];
    });
    await purses.flush?.();
    return { purseId: p.id, session };
  }

  // Which purse a Mama session belongs to (or null).
  function sessionPurse(session) {
    if (!session) return null;
    const h = sha(session);
    return all().find((p) => (p.mamaSessions ?? []).some((s) => s.hash === h))?.id ?? null;
  }

  // The purse a guardian (Privy user) owns, or null.
  const guardianPurse = (privyId) => byGuardian(privyId)?.id ?? null;

  return { checkMeter, prepare, complete, prepareLimits, completeLimits, testUsdc, dashboard, sendNewInvite, invite, sendCode, verifyCode, sessionPurse, guardianPurse };
}

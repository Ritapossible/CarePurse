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

const PENDING_SETUP_MS = 9 * 60_000; // the guardian signature request is valid ~10 minutes (120 ledgers)
const MAX_SETUPS_PER_DAY = 5; // each one deploys a contract, paid by the agent
const SESSION_DAYS = 30; // Mama stays signed in on her phone this long

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
      p.mamaSessions = []; // a new link signs Mama out everywhere; she signs in again with it
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

    // A pending sign-up whose signature request is still valid (~10 minutes) is returned as it is:
    // each new attempt deploys a contract and costs the agent XLM, so a reload or a looping client
    // must not create more. Same details: same request. After it expires, start again, at most
    // MAX_SETUPS_PER_DAY times a day.
    const sameRequest = existing?.setup?.status === "pending" && existing.setup.pending && existing.guardian.address === guardian.address
      && existing.preset === preset && existing.destinations.electricity === m && existing.destinations.airtime === phone
      && now() - Date.parse(existing.setup.createdAt) < PENDING_SETUP_MS;
    if (sameRequest) return { purseId: existing.id, status: "pending", contractId: existing.contractId, hash: existing.setup.pending.hash };
    const today = (existing?.setupAttempts ?? []).filter((t) => now() - Date.parse(t) < DAY);
    if (today.length >= MAX_SETUPS_PER_DAY) throw new FamilyError(429, "Too many set-up attempts today. Please try again tomorrow.");

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
    purse.setupAttempts = [...today, iso()];
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

  // ── Pause and withdraw: one signature each, like the plan ───────────────────
  // One pending approval at a time (p.action). completeAction finishes whichever it is.
  const STELLAR_ADDRESS = /^[GC][A-Z2-7]{55}$/;

  async function preparePause({ privyId, paused }) {
    const p = mine(privyId);
    if (p.setup?.status !== "active") throw new FamilyError(409, "finish setting up first");
    const method = paused ? "pause" : "unpause";
    const pending = await signup.prepareGuardianCall({ contractId: p.contractId, guardianAddress: p.guardian.address, method, args: [] });
    purses.update(p.id, (x) => { x.action = { kind: method, pending, createdAt: iso() }; });
    await purses.flush?.();
    return { status: "pending", kind: method, hash: pending.hash };
  }

  // Withdraw to her own wallet (the default) or any Stellar address. If her wallet can't hold USDC
  // yet, the first approval is the one-time opt-in; she then confirms the withdrawal itself.
  async function prepareWithdraw({ privyId, usdc, to }) {
    const p = mine(privyId);
    if (p.setup?.status !== "active") throw new FamilyError(409, "finish setting up first");
    const dest = String(to || p.guardian.address).trim();
    if (!STELLAR_ADDRESS.test(dest)) throw new FamilyError(400, "That isn’t a Stellar address (it starts with G or C and has 56 characters).");
    if (dest === p.contractId) throw new FamilyError(400, "That’s Mama’s purse itself.");
    const amount = Math.floor(Number(usdc) * 1e7) / 1e7;
    if (!(amount > 0)) throw new FamilyError(400, "Enter an amount above 0.");
    const balance = await signup.purseBalance(p.contractId);
    if (amount > balance) throw new FamilyError(400, `The purse has ${balance} USDC.`);
    if (dest.startsWith("G") && !(await signup.hasUsdcTrustline(dest))) {
      if (dest !== p.guardian.address) throw new FamilyError(400, "That wallet can’t receive USDC yet. Send to your CarePurse wallet, or ask its owner to add USDC first.");
      const pending = await signup.prepareTrustline(dest);
      purses.update(p.id, (x) => { x.action = { kind: "trustline", pending, then: { usdc: amount, to: dest }, createdAt: iso() }; });
      await purses.flush?.();
      return { status: "pending", kind: "trustline", hash: pending.hash };
    }
    const pending = await signup.prepareWithdraw({ contractId: p.contractId, guardianAddress: p.guardian.address, to: dest, usdc: amount });
    purses.update(p.id, (x) => { x.action = { kind: "withdraw", pending, usdc: amount, to: dest, createdAt: iso() }; });
    await purses.flush?.();
    return { status: "pending", kind: "withdraw", hash: pending.hash, usdc: amount, to: dest };
  }

  async function completeAction({ privyId, signature }) {
    const p = mine(privyId);
    const a = p.action;
    if (!a?.pending) throw new FamilyError(409, "start again");
    const fail = (err) => {
      throw new FamilyError(400, /does not match|signature/.test(err.message) ? "That signature didn’t match. Please try again." : `Could not finish on Stellar (${err.message.slice(0, 80)})`);
    };
    if (a.kind === "trustline") {
      await signup.completeTrustline(a.pending, p.guardian.address, signature).catch(fail);
      purses.update(p.id, (x) => { x.action = null; });
      // Opted in: now the withdrawal itself, for her second approval.
      return prepareWithdraw({ privyId, usdc: a.then.usdc, to: a.then.to });
    }
    const done = await signup.completeGuardianCall(a.pending, p.guardian.address, signature).catch(fail);
    purses.update(p.id, (x) => {
      x.action = null;
      if (a.kind === "pause" || a.kind === "unpause") x.paused = a.kind === "pause";
      if (a.kind === "withdraw") (x.withdrawals ??= []).push({ at: iso(), usdc: a.usdc, to: a.to, tx: done.hash });
      (x.notifications ??= []).push({ at: iso(), kind: a.kind, text: a.kind === "withdraw" ? `Withdrew ${a.usdc} USDC to ${a.to.slice(0, 6)}…${a.to.slice(-4)} (tx ${done.hash}).` : `Purse ${a.kind === "pause" ? "paused" : "resumed"} (tx ${done.hash}).` });
    });
    await purses.flush?.();
    return { status: "done", kind: a.kind, tx: done.hash };
  }

  // ── Her account ───────────────────────────────────────────
  // Profile lives on her purse record (name, a small photo). The photo is a data URL the browser
  // has already shrunk; only small JPEG, PNG or WebP images are kept.
  const AVATAR = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const MAX_AVATAR_CHARS = 80_000; // ~60 KB

  function profile({ privyId }) {
    const p = byGuardian(privyId);
    if (!p) return { profile: null };
    return { profile: { name: p.guardian.name, avatar: p.guardian.avatar ?? null, address: p.guardian.address, email: p.guardian.email ?? null, purseStatus: p.setup?.status ?? "active", contractId: p.contractId } };
  }

  async function updateProfile({ privyId, name, avatar }) {
    const p = mine(privyId);
    const next = {};
    if (name !== undefined) {
      const n = String(name ?? "").trim().slice(0, 40);
      if (!n) throw new FamilyError(400, "Add your name.");
      next.name = n;
    }
    if (avatar !== undefined) {
      if (avatar === null) next.avatar = null;
      else if (typeof avatar !== "string" || !AVATAR.test(avatar)) throw new FamilyError(400, "Use a JPEG, PNG or WebP photo.");
      else if (avatar.length > MAX_AVATAR_CHARS) throw new FamilyError(413, "That photo is too large.");
      else next.avatar = avatar;
    }
    purses.update(p.id, (x) => { x.guardian = { ...x.guardian, ...next }; });
    await purses.flush?.();
    return profile({ privyId });
  }

  // Close her account: CarePurse forgets the family (purse record, Mama's invite and sign-ins).
  // Money first: the purse must be empty and nothing in flight, so no USDC is ever stranded.
  // The contract stays on Stellar (nothing can delete it); with no record it is never used again.
  async function deleteAccount({ privyId }) {
    const p = byGuardian(privyId);
    if (!p) return { deleted: true };
    if (p.openOrder) throw new FamilyError(409, "A top-up is still being settled. Try again in a few minutes.");
    if (p.setup?.status === "active") {
      const balance = await signup.purseBalance(p.contractId);
      if (balance > 0) throw new FamilyError(409, `Mama’s purse still holds ${balance} USDC. Withdraw it first, then delete your account.`);
    }
    purses.remove(p.id);
    await purses.flush?.();
    return { deleted: true };
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
        withdrawals: [...(p.withdrawals ?? [])].reverse().slice(0, 10),
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
    return all().find((p) => (p.mamaSessions ?? []).some((s) => s.hash === h && now() - Date.parse(s.createdAt) < SESSION_DAYS * DAY))?.id ?? null;
  }

  // The purse a guardian (Privy user) owns, or null.
  const guardianPurse = (privyId) => byGuardian(privyId)?.id ?? null;

  return { profile, updateProfile, deleteAccount, checkMeter, prepare, complete, prepareLimits, completeLimits, preparePause, prepareWithdraw, completeAction, testUsdc, dashboard, sendNewInvite, invite, sendCode, verifyCode, sessionPurse, guardianPurse };
}

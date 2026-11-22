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
import { Keypair } from "@stellar/stellar-sdk";
import { openAgentKey, sealAgentKey } from "./agent-keys.mjs";

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

// Sign-in codes: a short wait between codes, and caps per invite per hour, so a leaked link can't
// be brute-forced (each new code would otherwise reset the 5 tries).
const CODE_GAP_MS = 30_000;
const CODES_PER_HOUR = 5;
const FAILS_PER_HOUR = 15;
const HOUR = 3_600_000;
// "0801 ••• 1111": enough for Mama to recognise her number, not enough to learn it from the link.
export const maskPhone = (p) => String(p ?? "").replace(/^(\d{4})\d+(\d{4})$/, "$1 ••• $2");

export function createFamilies({ purses, signup, config, verifyMeter, sms = null, clock = () => Date.now() }) {
  const now = () => clock();
  const iso = (t = now()) => new Date(t).toISOString();
  const all = () => purses.all();
  // Lookups by daughter, Mama's session and invite run on every request: remembered (key → purse id)
  // and re-checked against the purse each time, so a stale entry is never trusted. A miss scans once.
  const index = { guardian: new Map(), session: new Map(), invite: new Map() };
  function lookup(map, key, matches) {
    const id = map.get(key);
    const hit = id ? purses.get(id) : null;
    if (hit && matches(hit)) return hit;
    map.delete(key);
    const found = all().find(matches) ?? null;
    if (found) map.set(key, found.id);
    return found;
  }
  const byGuardian = (privyId) => (privyId ? lookup(index.guardian, privyId, (p) => p.guardian?.privyId === privyId) : null);
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
  // One sign-up or wallet move at a time per daughter: a double click or a looping client can't run
  // two (each one spends the operator's XLM).
  const busy = new Set();
  async function once(privyId, fn) {
    if (busy.has(privyId)) throw new FamilyError(409, "This is already being prepared. One moment, then try again.");
    busy.add(privyId);
    try { return await fn(); } finally { busy.delete(privyId); }
  }

  // The family's own agent wallet, made at most once and never lost. The key is created and saved
  // (sealed) before the network is asked to create the account; if that step fails or times out,
  // the next try finishes it with the same key (createAgentWallet is idempotent). `field` is
  // "agent" at sign-up, "nextAgent" for an older purse moving to its own wallet.
  async function ensureAgentWallet(purseId, field) {
    if (!purses.get(purseId)[field]) {
      const kp = Keypair.random();
      purses.update(purseId, (x) => { x[field] = { address: kp.publicKey(), sealed: sealAgentKey(kp.secret(), config.agentSecret), ready: false }; });
      await purses.flush?.();
    }
    const rec = purses.get(purseId)[field];
    if (!rec.ready) {
      await signup.createAgentWallet({ secret: openAgentKey(rec.sealed, config.agentSecret) });
      purses.update(purseId, (x) => { x[field].ready = true; });
      await purses.flush?.();
    }
    return purses.get(purseId)[field];
  }

  async function prepare(input) {
    if (!input?.guardian?.privyId || !input?.guardian?.address) throw new FamilyError(401, "sign in first");
    return once(input.guardian.privyId, () => prepareOnce(input));
  }

  async function prepareOnce({ guardian, mama, meter, disco = "ikeja-electric", network = "mtn", preset = "standard" }) {
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
    // new purse contract, so the rules always come from one signature. The record is saved and
    // the attempt counted BEFORE anything costs XLM, so failures count against the daily cap too.
    // An agent wallet from an earlier attempt is kept and reused (its contract was never set up).
    const id = existing?.id ?? `p_${crypto.randomBytes(6).toString("hex")}`;
    const purse = newPurse({
      id,
      mama: { name, phone, language },
      guardian: { name: String(guardian.name ?? "").trim().slice(0, 40) || "Your child", email: guardian.email ?? null, privyId: guardian.privyId, address: guardian.address },
      destinations,
      providers: { disco, network },
      preset,
      contractId: null,
    });
    purse.setup = { status: "pending", createdAt: iso(), pending: null };
    purse.setupAttempts = [...today, iso()];
    purse.testUsdc = 0;
    if (existing?.agent) purse.agent = existing.agent;
    purses.put(purse);
    await purses.flush?.();

    const agent = await ensureAgentWallet(id, "agent");
    const pending = await signup.prepareSetup({ guardianAddress: guardian.address, limits, destinations, agentAddress: agent.address });
    purses.update(id, (x) => { x.contractId = pending.contractId; x.setup = { status: "pending", createdAt: iso(), pending }; });
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
    oneAtATime(p, "plan");
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
    for (const k of behindCache.keys()) if (k.startsWith(`${p.contractId}:`)) behindCache.delete(k);
    await purses.flush?.();
    return { status: "active", preset: change.preset, tx: done.hash };
  }

  // ── One approval at a time ─────────────────────────────────
  // Plan, pause, withdraw, wallet opt-in and Upgrade each wait for one signature. Starting a
  // different one while another is still open would silently drop it, so she's asked to finish (or
  // dismiss) the open one first. The same kind may be prepared again. A request expires after
  // ~10 minutes (its signature can't land after that); only the server holds it, so dropping it is
  // safe either way.
  const APPROVAL_MS = 10 * 60_000;
  const APPROVAL_LABEL = { plan: "your plan", pause: "pausing the purse", unpause: "resuming the purse", withdraw: "the withdrawal", trustline: "the withdrawal", agent: "the wallet upgrade", destinations: "Mama’s new details" };
  function openApproval(p) {
    const fresh = (x) => x && now() - Date.parse(x.createdAt) < APPROVAL_MS;
    if (fresh(p.limitsChange)) return "plan";
    if (fresh(p.action)) return p.action.kind;
    return null;
  }
  function oneAtATime(p, kind) {
    const open = openApproval(p);
    const same = open === kind || (kind === "withdraw" && open === "trustline") || ((kind === "pause" || kind === "unpause") && (open === "pause" || open === "unpause"));
    if (open && !same) throw new FamilyError(409, `Please finish approving ${APPROVAL_LABEL[open] ?? "the last change"} first, or dismiss it and try again.`);
  }
  // She dismissed the approval in her wallet: forget it, so she can start something else.
  async function cancelApproval({ privyId }) {
    const p = mine(privyId);
    purses.update(p.id, (x) => { x.action = null; x.limitsChange = null; });
    await purses.flush?.();
    return { cancelled: true };
  }

  // ── Pause and withdraw: one signature each, like the plan ───────────────────
  // One pending approval at a time (p.action). completeAction finishes whichever it is.
  const STELLAR_ADDRESS = /^[GC][A-Z2-7]{55}$/;

  async function preparePause({ privyId, paused }) {
    const p = mine(privyId);
    if (p.setup?.status !== "active") throw new FamilyError(409, "finish setting up first");
    const method = paused ? "pause" : "unpause";
    oneAtATime(p, method);
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
    oneAtATime(p, "withdraw");
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

  // ── Her family's own agent wallet ───────────────────────────
  // Purses made before per-family wallets use the shared one. One approval (`set_agent`) moves the
  // purse to a wallet of its own. Not while a top-up is open or a signed payment may still settle:
  // the old wallet must finish its order first (refunds and commits come from the wallet that holds
  // the money).
  function moveBlocked(p) {
    if (p.openOrder) return "A top-up is still being settled. Try again in a few minutes.";
    if (now() < (Date.parse(p.payHoldUntil ?? "") || 0)) return "A recent top-up is still being closed safely. Try again in 2 minutes.";
    return null;
  }

  async function prepareAgentMove({ privyId }) {
    return once(privyId, () => prepareAgentMoveOnce({ privyId }));
  }

  async function prepareAgentMoveOnce({ privyId }) {
    const p = mine(privyId);
    if (p.setup?.status !== "active") throw new FamilyError(409, "finish setting up first");
    if (p.agent) throw new FamilyError(409, "Mama’s purse already has its own wallet.");
    oneAtATime(p, "agent");
    const blocked = moveBlocked(p);
    if (blocked) throw new FamilyError(409, blocked);
    // A move she started whose approval is still valid on-chain is offered again as it is.
    if (p.action?.kind === "agent") {
      const ledger = await signup.latestLedger().catch(() => null);
      if (ledger == null) throw new FamilyError(503, "Stellar didn’t answer. Please try again.");
      if (ledger <= p.action.pending.validUntil) return { status: "pending", kind: "agent", hash: p.action.pending.hash };
    }
    // The same new wallet on every try (made once, kept if a later step fails).
    const next = await ensureAgentWallet(p.id, "nextAgent");
    // The contract itself refuses while an order is open (Error #15, from contract v6): say so plainly.
    const pending = await signup.prepareSetAgent({ contractId: p.contractId, guardianAddress: p.guardian.address, agentAddress: next.address }).catch((err) => {
      throw /Error\(Contract, #15\)/.test(err.message) ? new FamilyError(409, "A top-up is still being settled. Try again in a few minutes.") : err;
    });
    purses.update(p.id, (x) => { x.action = { kind: "agent", pending, createdAt: iso() }; });
    await purses.flush?.();
    return { status: "pending", kind: "agent", hash: pending.hash };
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
    if (a.kind === "agent") {
      const blocked = moveBlocked(p);
      if (blocked) throw new FamilyError(409, blocked);
    }
    const done = await signup.completeGuardianCall(a.pending, p.guardian.address, signature).catch(fail);
    purses.update(p.id, (x) => {
      x.action = null;
      if (a.kind === "agent") {
        x.agent = x.nextAgent;
        delete x.nextAgent;
        (x.notifications ??= []).push({ at: iso(), kind: "agent", text: `Mama’s purse now has its own Mhasibu AI wallet (tx ${done.hash}).` });
        return;
      }
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
    // A payment Mhasibu signed and gave up on stays valid until its window ends. The hold that keeps
    // every family's money off the shared agent wallet until then lives on this record, so the
    // record must outlive it.
    const holdUntil = Date.parse(p.payHoldUntil ?? "") || 0;
    if (now() < holdUntil) {
      const minutes = Math.max(1, Math.ceil((holdUntil - now()) / 60_000));
      throw new FamilyError(409, `A recent top-up is still being closed safely. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }
    if (p.setup?.status === "active") {
      const balance = await signup.purseBalance(p.contractId);
      if (balance > 0) throw new FamilyError(409, `Mama’s purse still holds ${balance} USDC. Withdraw it first, then delete your account.`);
    }
    purses.remove(p.id);
    await purses.flush?.();
    return { deleted: true };
  }

  async function testUsdc({ privyId }) {
    return once(privyId, () => testUsdcOnce({ privyId }));
  }
  async function testUsdcOnce({ privyId }) {
    const p = mine(privyId);
    if (p.setup?.status !== "active") throw new FamilyError(409, "finish setting up first");
    if ((p.testUsdc ?? 0) >= TEST_USDC_TIMES) throw new FamilyError(429, "That’s enough test USDC for this purse.");
    const sent = await signup.sendTestUsdc(p.contractId, TEST_USDC);
    purses.update(p.id, (x) => { x.testUsdc = (x.testUsdc ?? 0) + 1; });
    await purses.flush?.();
    return { ...sent, usdc: TEST_USDC };
  }

  // Whether the purse's on-chain caps have fallen behind today's naira rate (cached 10 minutes).
  const behindCache = new Map();
  async function rulesBehind(p) {
    if (p.setup?.status !== "active" || !signup.capsBehind) return false;
    const key = `${p.contractId}:${config.ngnPerUsdc}:${p.preset}`;
    const hit = behindCache.get(key);
    if (hit && clock() - hit.at < 10 * 60_000) return hit.value;
    const value = await signup.capsBehind({ contractId: p.contractId, limits: p.limits }).catch(() => false);
    behindCache.set(key, { at: clock(), value });
    return value;
  }

  // What changed in her plan since it was saved: "Data: ₦1,000 a time (was ₦500)".
  const LIMIT_WORDS = { perTopup: "a time", perDay: "a day", perWeek: "a week", perMonth: "a month" };
  const UTILITY_WORDS = { electricity: "Electricity", airtime: "Airtime", data: "Data" };
  const ngnText = (n) => `₦${Number(n).toLocaleString("en-NG")}`;
  function planChanges(p) {
    const plan = PRESETS[p.preset];
    if (!plan) return [];
    const lines = [];
    for (const [u, limits] of Object.entries(plan)) {
      for (const [field, words] of Object.entries(LIMIT_WORDS)) {
        const was = p.limits?.[u]?.[field];
        const next = limits[field];
        if (was !== next && (was || next)) lines.push(`${UTILITY_WORDS[u] ?? u}: ${next ? `${ngnText(next)} ${words}` : `no limit ${words}`}${was ? ` (was ${ngnText(was)})` : ""}`);
      }
    }
    return lines;
  }

  async function dashboard({ privyId }) {
    const p = byGuardian(privyId);
    if (!p) return { purse: null };
    const [balanceUsdc, behind] = await Promise.all([
      p.setup?.status === "active" ? signup.purseBalance(p.contractId).catch(() => null) : null,
      rulesBehind(p),
    ]);
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
        notifications: [...(p.notifications ?? [])].reverse().slice(0, 30).map(({ at, kind, text, read }) => ({ at, kind, text, read: Boolean(read) })),
        unread: (p.notifications ?? []).filter((n) => !n.read).length,
        testUsdcLeft: TEST_USDC_TIMES - (p.testUsdc ?? 0),
        withdrawals: [...(p.withdrawals ?? [])].reverse().slice(0, 10),
        rulesBehind: behind,
        ownWallet: Boolean(p.agent),
        // Her plan has changed since it was saved (e.g. Standard data ₦500 → ₦1,000 a time): her purse
        // keeps the old limits, on-chain and here, until she approves the new ones.
        planOutdated: Boolean(PRESETS[p.preset]) && JSON.stringify(p.limits) !== JSON.stringify(PRESETS[p.preset]),
        planChanges: planChanges(p),
      },
    };
  }

  // Her full purchase history, newest first, a page at a time (the dashboard shows only the latest).
  // `utility` filters to electricity, airtime or data. Totals cover every matching purchase.
  function activity({ privyId, utility, offset = 0, limit = 20 }) {
    const p = byGuardian(privyId);
    if (!p) throw new FamilyError(404, "no purse yet");
    if (utility && !["electricity", "airtime", "data"].includes(utility)) throw new FamilyError(400, "unknown utility");
    const all = [...p.spends].reverse().filter((s) => !utility || s.utility === utility);
    const from = Math.max(0, Math.floor(Number(offset) || 0));
    const size = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
    return {
      items: all.slice(from, from + size),
      total: all.length,
      nextOffset: from + size < all.length ? from + size : null,
      totals: {
        ngn: all.reduce((n, s) => n + s.ngn, 0),
        chargedNgn: all.reduce((n, s) => n + (s.chargedNgn ?? s.ngn), 0),
        feeNgn: all.reduce((n, s) => n + (s.feeNgn ?? 0), 0),
      },
      mama: { name: p.mama.name },
    };
  }

  // She has seen her notifications (the dashboard bell): mark them all read.
  async function readNotifications({ privyId }) {
    const p = mine(privyId);
    purses.update(p.id, (x) => { for (const n of x.notifications ?? []) n.read = true; });
    await purses.flush?.();
    return { unread: 0 };
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
    const p = lookup(index.invite, h, (x) => x.invite?.hash === h);
    if (!p) throw new FamilyError(404, "This link isn’t valid. Ask your child to send a new one.");
    if (p.invite.usedAt) throw new FamilyError(410, "This link was already used. Ask your child to send a new one.");
    if (Date.parse(p.invite.expiresAt) < now()) throw new FamilyError(410, "This link has expired. Ask your child to send a new one.");
    return p;
  }

  // M1: what the invite page shows (her phone is filled in).
  function invite(t) {
    const p = findInvite(t);
    // Her number is never sent to whoever holds the link, only a hint: she types it in full.
    return { mamaName: p.mama.name, guardianName: p.guardian.name, phoneHint: maskPhone(p.mama.phone), language: p.mama.language, codeBySms: Boolean(sms?.configured) };
  }

  // A 6-digit code for the number on the invite, by text message (Termii). In the demo
  // (SHOW_MAMA_CODE=1) it is also returned to the page. Rate-limited per invite.
  const recentTimes = (list) => (list ?? []).filter((t) => now() - Date.parse(t) < HOUR);
  async function sendCode(t, phoneRaw) {
    const p = findInvite(t);
    const phone = normalisePhone(phoneRaw);
    if (phone !== p.mama.phone) throw new FamilyError(403, "That isn’t the number your child entered.");
    if (!sms?.configured && !config.showMamaCode) throw new FamilyError(503, "Sign-in by text message isn’t set up yet. Please ask your child.");
    const sends = recentTimes(p.codeSends);
    if (sends.length && now() - Date.parse(sends.at(-1)) < CODE_GAP_MS) throw new FamilyError(429, "Please wait a moment before asking for another code.");
    if (sends.length >= CODES_PER_HOUR) throw new FamilyError(429, "Too many codes for now. Please try again in an hour.");
    if (recentTimes(p.codeFails).length >= FAILS_PER_HOUR) throw new FamilyError(429, "Too many wrong codes. Please try again in an hour.");
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    purses.update(p.id, (x) => {
      x.mamaCode = { hash: sha(`${p.id}:${code}`), expiresAt: iso(now() + CODE_MINUTES * 60_000), tries: 0 };
      x.codeSends = [...recentTimes(x.codeSends), iso()];
    });
    await purses.flush?.();
    if (sms?.configured) {
      await sms.send(phone, `CarePurse: your code is ${code}. It expires in ${CODE_MINUTES} minutes. Don't share it with anyone.`)
        .catch((err) => { throw new FamilyError(502, err.message); });
    }
    return config.showMamaCode ? { sent: true, code, via: sms?.configured ? "sms" : "screen" } : { sent: true, via: "sms" };
  }

  async function verifyCode(t, phoneRaw, codeRaw) {
    const p = findInvite(t);
    if (normalisePhone(phoneRaw) !== p.mama.phone) throw new FamilyError(403, "That isn’t the number your child entered.");
    const c = p.mamaCode;
    if (!c || Date.parse(c.expiresAt) < now()) throw new FamilyError(410, "The code has expired. Tap Send code again.");
    if (c.tries >= CODE_TRIES) throw new FamilyError(429, "Too many tries. Tap Send code again.");
    if (recentTimes(p.codeFails).length >= FAILS_PER_HOUR) throw new FamilyError(429, "Too many wrong codes. Please try again in an hour.");
    if (sha(`${p.id}:${String(codeRaw ?? "").trim()}`) !== c.hash) {
      purses.update(p.id, (x) => { x.mamaCode.tries += 1; x.codeFails = [...recentTimes(x.codeFails), iso()]; });
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
      x.codeSends = [];
      x.codeFails = [];
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
    return lookup(index.session, h, (p) => (p.mamaSessions ?? []).some((s) => s.hash === h && now() - Date.parse(s.createdAt) < SESSION_DAYS * DAY))?.id ?? null;
  }

  // The purse a guardian (Privy user) owns, or null.
  const guardianPurse = (privyId) => byGuardian(privyId)?.id ?? null;

  return { profile, updateProfile, deleteAccount, checkMeter, prepare, complete, prepareLimits, completeLimits, preparePause, prepareWithdraw, completeAction, cancelApproval, prepareAgentMove, testUsdc, dashboard, activity, readNotifications, sendNewInvite, invite, sendCode, verifyCode, sessionPurse, guardianPurse };
}

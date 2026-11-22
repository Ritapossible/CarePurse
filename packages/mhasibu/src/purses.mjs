// Purses, kept in a small JSON file for now (a database later).
// Until the daughter's dashboard exists, a demo purse is seeded with the Standard preset.
import fs from "node:fs";
import path from "node:path";
import { PRESETS, monthlyCap } from "./limits.mjs";
import { openRecords } from "./records.mjs";

// Uses the VTpass sandbox's test numbers (meter 1111111111111, phone 08011111111), which the
// sandbox always fulfils. The mock provider accepts them too.
export const DEMO_PURSE = {
  id: "demo",
  mama: { name: "Ngozi", phone: "08011111111", language: "pcm" },
  guardian: { name: "Adaeze" },
  destinations: { electricity: "1111111111111", airtime: "08011111111", data: "08011111111" },
  // Who delivers: Mama's electricity company and mobile network (VTpass service IDs).
  providers: { disco: "ikeja-electric", network: "mtn" },
  preset: "standard",
};

// contractId: the family's own purse contract (set at sign-up). Without one, the purse uses the
// default contract (PURSE_CONTRACT_ID), which is how the demo purse works.
export function newPurse({ id, mama, guardian, destinations, providers = { disco: "ikeja-electric", network: "mtn" }, preset = "standard", contractId = null }) {
  const limits = structuredClone(PRESETS[preset]);
  return { id, mama, guardian, destinations, providers, preset, limits, monthlyCap: monthlyCap(limits), contractId, paused: false, spends: [], notifications: [], pending: null, history: [] };
}

// Use this to start Mhasibu: Postgres if DATABASE_URL is set (purses, purchases, tokens and chat
// survive restarts), the JSON file otherwise.
export async function openPurseStore({ file, databaseUrl, seed = true, log } = {}) {
  if (!databaseUrl) return createPurseStore(file, { seed });
  const records = await openRecords(databaseUrl, ["purse", "avatar"], { log });
  return createPurseStore(null, { seed, records });
}

export const MAX_HISTORY = 300;
export const MAX_NOTIFICATIONS = 100;

export function createPurseStore(file, { seed = true, records = null } = {}) {
  let state = { purses: {} };
  if (records) {
    for (const r of records.rows) if (r.kind !== "avatar") state.purses[r.id] = r.doc;
    // Her photo is its own row (written only when it changes), joined back here.
    for (const r of records.rows) if (r.kind === "avatar" && state.purses[r.id]?.guardian) state.purses[r.id].guardian.avatar = r.doc.avatar ?? null;
  }
  else if (file && fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, "utf8"));
  // Kept small: the chat history and notifications are capped (purchases are kept: limits and
  // her history need them). The photo is stored apart, and only when it changes.
  const lastAvatar = new Map(Object.values(state.purses).map((p) => [p.id, p.guardian?.avatar ?? null]));
  function persist(id) {
    const p = state.purses[id];
    if (!p) return;
    if (p.history?.length > MAX_HISTORY) p.history.splice(0, p.history.length - MAX_HISTORY);
    if (p.notifications?.length > MAX_NOTIFICATIONS) p.notifications.splice(0, p.notifications.length - MAX_NOTIFICATIONS);
    if (!records) return;
    const { avatar = null, ...guardian } = p.guardian ?? {};
    records.save("purse", id, { ...p, guardian });
    if (avatar !== (lastAvatar.get(id) ?? null)) {
      lastAvatar.set(id, avatar);
      // If that write fails, forget it was saved, so the next change to this purse writes it again.
      Promise.resolve(records.save("avatar", id, { avatar })).then((ok) => { if (ok === false && lastAvatar.get(id) === avatar) lastAvatar.delete(id); });
    }
  }

  if (seed && !state.purses[DEMO_PURSE.id]) {
    state.purses[DEMO_PURSE.id] = newPurse(DEMO_PURSE);
    persist(DEMO_PURSE.id);
  }

  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  };
  save();

  // Bumped whenever a purse is added or removed (lookups can remember a miss until then).
  let version = 0;
  return {
    version: () => version,
    get: (id) => state.purses[id] ?? null,
    // Every purse (sign-up lookups: by guardian, invite or Mama's session).
    all: () => Object.values(state.purses),
    put(purse) { const isNew = !state.purses[purse.id]; state.purses[purse.id] = purse; if (isNew) version++; persist(purse.id); save(); return purse; },
    // A purse removed meanwhile (her account was closed mid-chat): nothing to update.
    update(id, fn) { const purse = state.purses[id]; if (!purse) return null; fn(purse); persist(id); save(); return purse; },
    remove(id) { if (state.purses[id]) version++; delete state.purses[id]; lastAvatar.delete(id); records?.remove("purse", id); records?.remove("avatar", id); save(); },
    // Wait until every change so far is stored.
    flush: async () => { await records?.flush(); },
    close: async () => { await records?.close(); },
  };
}

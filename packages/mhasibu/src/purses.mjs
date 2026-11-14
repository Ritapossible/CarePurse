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

export function newPurse({ id, mama, guardian, destinations, providers = { disco: "ikeja-electric", network: "mtn" }, preset = "standard" }) {
  const limits = structuredClone(PRESETS[preset]);
  return { id, mama, guardian, destinations, providers, preset, limits, monthlyCap: monthlyCap(limits), paused: false, spends: [], notifications: [], pending: null, history: [] };
}

// Use this to start Mhasibu: Postgres if DATABASE_URL is set (purses, purchases, tokens and chat
// survive restarts), the JSON file otherwise.
export async function openPurseStore({ file, databaseUrl, seed = true, log } = {}) {
  if (!databaseUrl) return createPurseStore(file, { seed });
  const records = await openRecords(databaseUrl, ["purse"], { log });
  return createPurseStore(null, { seed, records });
}

export function createPurseStore(file, { seed = true, records = null } = {}) {
  let state = { purses: {} };
  if (records) for (const r of records.rows) state.purses[r.id] = r.doc;
  else if (file && fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, "utf8"));
  if (seed && !state.purses[DEMO_PURSE.id]) {
    state.purses[DEMO_PURSE.id] = newPurse(DEMO_PURSE);
    records?.save("purse", DEMO_PURSE.id, state.purses[DEMO_PURSE.id]);
  }

  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  };
  save();

  return {
    get: (id) => state.purses[id] ?? null,
    put(purse) { state.purses[purse.id] = purse; records?.save("purse", purse.id, purse); save(); return purse; },
    update(id, fn) { const purse = state.purses[id]; fn(purse); records?.save("purse", id, purse); save(); return purse; },
    // Wait until every change so far is stored.
    flush: async () => { await records?.flush(); },
    close: async () => { await records?.close(); },
  };
}

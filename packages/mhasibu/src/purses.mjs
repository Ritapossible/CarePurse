// Purses, kept in a small JSON file for now (a database later).
// Until the daughter's dashboard exists, a demo purse is seeded with the Standard preset.
import fs from "node:fs";
import path from "node:path";
import { PRESETS, monthlyCap } from "./limits.mjs";

export const DEMO_PURSE = {
  id: "demo",
  mama: { name: "Ngozi", phone: "08031234567", language: "pcm" },
  guardian: { name: "Adaeze" },
  destinations: { electricity: "45012345678", airtime: "08031234567", data: "08031234567" },
  preset: "standard",
};

export function newPurse({ id, mama, guardian, destinations, preset = "standard" }) {
  const limits = structuredClone(PRESETS[preset]);
  return { id, mama, guardian, destinations, preset, limits, monthlyCap: monthlyCap(limits), paused: false, spends: [], notifications: [], pending: null, history: [] };
}

export function createPurseStore(file, { seed = true } = {}) {
  let state = { purses: {} };
  if (file && fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, "utf8"));
  if (seed && !state.purses[DEMO_PURSE.id]) state.purses[DEMO_PURSE.id] = newPurse(DEMO_PURSE);

  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  };
  save();

  return {
    get: (id) => state.purses[id] ?? null,
    put(purse) { state.purses[purse.id] = purse; save(); return purse; },
    update(id, fn) { const purse = state.purses[id]; fn(purse); save(); return purse; },
  };
}

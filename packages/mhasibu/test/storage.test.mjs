// Storage: writes coalesced per record, encryption required in production, small purse rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openRecords } from "../src/records.mjs";
import { DEMO_PURSE, MAX_HISTORY, MAX_NOTIFICATIONS, createPurseStore, newPurse } from "../src/purses.mjs";

function fakePool(rows = []) {
  const writes = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const pool = {
    writes,
    open: () => release(),
    connect: async () => ({ query: async () => ({ rows: [] }), release() {} }),
    query: async (sql, args) => {
      if (/^select/i.test(sql.trim())) return { rows };
      await gate; // hold every write until the test opens the gate
      writes.push({ sql: sql.trim().split(/\s+/)[0], kind: args[0], id: args[1], doc: args[2] });
      return { rows: [] };
    },
    end: async () => {},
  };
  return pool;
}

test("several saves of one record before it is written become one write of the latest state", async () => {
  const pool = fakePool();
  const r = await openRecords("postgres://fake", ["purse"], { pool, encryptionKey: "k".repeat(32), log: { warn() {}, error() {} } });
  r.save("purse", "a", { n: 1 });
  r.save("purse", "a", { n: 2 });
  r.save("purse", "b", { n: 1 });
  r.save("purse", "a", { n: 3 });
  pool.open();
  await r.flush();
  assert.deepEqual(pool.writes.map((w) => w.id), ["a", "b"]); // one write each
  // Sealed (never plain JSON), and the written state of "a" is the latest.
  assert.ok(!pool.writes[0].doc.includes('"n":3') && pool.writes[0].doc.includes('"enc"'));
  r.save("purse", "a", { n: 4 });
  r.remove("purse", "a");
  await r.flush();
  assert.deepEqual(pool.writes.slice(2).map((w) => w.sql), ["delete"]); // removed before written: no write
});

test("no encryption key in production: refuse to start", async () => {
  const was = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(openRecords("postgres://fake", ["purse"], { pool: fakePool(), encryptionKey: "", log: { warn() {} } }), /DATA_ENCRYPTION_KEY is not set/);
  } finally { process.env.NODE_ENV = was; }
});

test("purse rows stay small: history and notifications capped, photo stored apart and only when it changes", () => {
  const saved = [];
  const records = { rows: [], save: (kind, id, doc) => saved.push({ kind, id, doc: structuredClone(doc) }), remove: (kind, id) => saved.push({ kind, id, removed: true }) };
  const purses = createPurseStore(null, { seed: false, records });
  purses.put(newPurse({ ...DEMO_PURSE, id: "p" }));
  purses.update("p", (p) => {
    for (let i = 0; i < MAX_HISTORY + 50; i++) p.history.push({ text: `m${i}` });
    for (let i = 0; i < MAX_NOTIFICATIONS + 20; i++) p.notifications.push({ text: `n${i}` });
  });
  const last = saved.filter((s) => s.kind === "purse").at(-1).doc;
  assert.equal(last.history.length, MAX_HISTORY);
  assert.equal(last.history.at(-1).text, `m${MAX_HISTORY + 49}`); // the newest are kept
  assert.equal(last.notifications.length, MAX_NOTIFICATIONS);
  saved.length = 0;
  purses.update("p", (p) => { p.guardian.avatar = "data:image/jpeg;base64,AAAA"; });
  assert.deepEqual(saved.map((s) => s.kind), ["purse", "avatar"]);
  assert.equal(saved[0].doc.guardian.avatar, undefined); // not inside the purse row
  saved.length = 0;
  purses.update("p", (p) => { p.paused = true; });
  assert.deepEqual(saved.map((s) => s.kind), ["purse"]); // photo unchanged: not written again
  assert.equal(purses.get("p").guardian.avatar, "data:image/jpeg;base64,AAAA"); // still there in memory
  purses.remove("p");
  assert.deepEqual(saved.slice(-2).map((s) => [s.kind, s.removed]), [["purse", true], ["avatar", true]]);
});

test("loading joins the photo back onto its purse", () => {
  const rows = [{ kind: "purse", id: "p", doc: newPurse({ ...DEMO_PURSE, id: "p" }) }, { kind: "avatar", id: "p", doc: { avatar: "data:image/png;base64,BBBB" } }];
  const purses = createPurseStore(null, { seed: false, records: { rows, save() {}, remove() {} } });
  assert.equal(purses.get("p").guardian.avatar, "data:image/png;base64,BBBB");
});

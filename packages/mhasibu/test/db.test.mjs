// Postgres tests: run only when TEST_DATABASE_URL is set (a throwaway database).
//   TEST_DATABASE_URL=postgresql://postgres@localhost:55432/carepurse_test npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { openPurseStore, DEMO_PURSE } from "../src/purses.mjs";

const url = process.env.TEST_DATABASE_URL;

test("purses, purchases and tokens survive a restart (Postgres)", { skip: !url && "set TEST_DATABASE_URL" }, async () => {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("drop table if exists carepurse_records");
  await pool.end();

  const first = await openPurseStore({ databaseUrl: url });
  assert.equal(first.get("demo").mama.name, DEMO_PURSE.mama.name); // seeded
  first.update("demo", (p) => { p.spends.push({ at: "2026-11-14T17:00:00Z", utility: "electricity", ngn: 500, order: "o1", token: "1111 2222 3333 4444 5555", units: "2.2 kWh" }); });
  for (let i = 0; i < 20; i++) first.update("demo", (p) => { p.history.push({ from: "mama", text: `message ${i}` }); }); // many quick writes, in order
  await first.flush();
  await first.close();

  // "Restart": a new store reads everything back.
  const second = await openPurseStore({ databaseUrl: url });
  const purse = second.get("demo");
  assert.equal(purse.spends[0].token, "1111 2222 3333 4444 5555");
  assert.equal(purse.history.length, 20);
  assert.equal(purse.history.at(-1).text, "message 19"); // the last write won
  await second.close();
});

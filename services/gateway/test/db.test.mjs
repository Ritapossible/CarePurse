// Postgres tests: run only when TEST_DATABASE_URL is set (a throwaway database).
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { openStore } from "../src/store.mjs";

const url = process.env.TEST_DATABASE_URL;

test("orders, their tokens and used transactions survive a restart (Postgres)", { skip: !url && "set TEST_DATABASE_URL" }, async () => {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("delete from carepurse_records where kind in ('order', 'tx')").catch(() => {});
  await pool.end();

  const first = await openStore({ databaseUrl: url });
  const order = first.create({ utility: "electricity", ngn: 500, destination: "1111111111111", amount: "3401361", ttlMinutes: 10 });
  first.transition(order.id, "created", "fulfilling");
  first.transition(order.id, "fulfilling", "delivered", { txHash: "a".repeat(64), token: "1111 2222 3333 4444 5555" });
  assert.equal(first.claimTransaction("a".repeat(64), order.id), true);
  await first.flush();
  await first.close();

  const second = await openStore({ databaseUrl: url });
  const back = second.get(order.id);
  assert.equal(back.status, "delivered");
  assert.equal(back.token, "1111 2222 3333 4444 5555");
  // The same Stellar transaction still can't settle a different order after the restart.
  assert.equal(second.claimTransaction("a".repeat(64), "another-order"), false);
  // And a delivered order can't be delivered again.
  assert.equal(second.transition(order.id, "created", "fulfilling"), null);
  await second.close();
});

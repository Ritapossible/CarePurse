// Durable records in Postgres (DATABASE_URL), for data that must survive restarts: orders and the
// tokens they delivered (gateway), purses, purchases and chat (Mhasibu).
//
// The stores keep working in memory exactly as before (synchronous, so the payment logic and its
// conditional status changes don't change). Every change is also written here, in order, and
// callers `await flush()` before answering, so nothing is shown to Mama before it's stored.
// One table, one JSON document per record. Assumes one running instance per service.
//
// NOTE: kept identical in services/gateway/src/records.mjs and packages/mhasibu/src/records.mjs
// (each service deploys on its own).
import pg from "pg";

const TABLE = "carepurse_records";

export async function openRecords(databaseUrl, kinds, { log = console } = {}) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  await pool.query(`create table if not exists ${TABLE} (
    kind text not null,
    id text not null,
    doc jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (kind, id))`);
  const { rows } = await pool.query(`select kind, id, doc from ${TABLE} where kind = any($1)`, [kinds]);

  let chain = Promise.resolve();
  let failure = null;
  return {
    rows,
    // Snapshot now, write in order. A failed write is logged and reported by the next flush().
    save(kind, id, doc) {
      const json = JSON.stringify(doc);
      chain = chain
        .then(() => pool.query(
          `insert into ${TABLE} (kind, id, doc) values ($1, $2, $3::jsonb)
           on conflict (kind, id) do update set doc = excluded.doc, updated_at = now()`, [kind, id, json]))
        .catch((err) => { failure = err; log.error?.(`database write failed (${kind} ${id}): ${err.message}`); });
    },
    async flush() {
      await chain;
      if (failure) { const err = failure; failure = null; throw err; }
    },
    async close() { await chain; await pool.end(); },
  };
}

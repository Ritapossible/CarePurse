// Durable records in Postgres (DATABASE_URL), for data that must survive restarts: orders and the
// tokens they delivered (gateway), purses, purchases and chat (Mhasibu).
//
// The stores keep working in memory exactly as before (synchronous, so the payment logic and its
// conditional status changes don't change). Every change is also written here, in order, and
// callers `await flush()` before answering, so nothing is shown to Mama before it's stored.
// One table, one JSON document per record. Assumes one running instance per service.
//
// Encrypted at rest: with DATA_ENCRYPTION_KEY set, each document is sealed with AES-256-GCM before
// it leaves the process (the row's kind and id are bound in as associated data, so a sealed row
// can't be swapped into another row). Postgres and its backups only ever hold
// {"enc":"v1.<base64>"}: no meter or phone numbers, tokens or chat. Plain rows written before the
// key was set are still read, and sealed on their next save.
//
// NOTE: kept identical in services/gateway/src/records.mjs and packages/mhasibu/src/records.mjs
// (each service deploys on its own).
import crypto from "node:crypto";
import pg from "pg";

const TABLE = "carepurse_records";

// Any string works as the key (Render's generated values included): it is stretched to 32 bytes.
export function sealer(secret) {
  if (!secret) return null;
  const key = crypto.createHash("sha256").update(`carepurse/records/v1:${secret}`).digest();
  return {
    seal(kind, id, doc) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", key, iv);
      c.setAAD(Buffer.from(`${kind}:${id}`));
      const body = Buffer.concat([c.update(JSON.stringify(doc), "utf8"), c.final()]);
      return { enc: `v1.${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64")}` };
    },
    open(kind, id, sealed) {
      const raw = Buffer.from(String(sealed.enc).replace(/^v1\./, ""), "base64");
      const d = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
      d.setAAD(Buffer.from(`${kind}:${id}`));
      d.setAuthTag(raw.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"));
    },
  };
}

export async function openRecords(databaseUrl, kinds, { log = console, encryptionKey = process.env.DATA_ENCRYPTION_KEY, pool: givenPool = null } = {}) {
  const box = sealer((encryptionKey ?? "").trim());
  if (!box) {
    // Mama's numbers, chat and sealed wallet keys live in these rows: never unencrypted in production.
    if (process.env.NODE_ENV === "production") throw new Error("DATA_ENCRYPTION_KEY is not set. Records are never stored unencrypted in production: set it (a long random string) and restart.");
    log.warn?.("DATA_ENCRYPTION_KEY is not set: records are stored unencrypted (development only).");
  }
  const pool = givenPool ?? new pg.Pool({ connectionString: databaseUrl, max: 3 });
  // The gateway and Mhasibu share one database and start together. Two "create table if not exists"
  // at the same moment can clash in Postgres, so take a lock first: one creates, the other waits.
  const setup = await pool.connect();
  try {
    await setup.query("begin");
    await setup.query("select pg_advisory_xact_lock(hashtext($1))", [TABLE]);
    await setup.query(`create table if not exists ${TABLE} (
    kind text not null,
    id text not null,
    doc jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (kind, id))`);
    await setup.query("commit");
  } catch (err) {
    await setup.query("rollback").catch(() => {});
    throw err;
  } finally {
    setup.release();
  }
  const { rows: stored } = await pool.query(`select kind, id, doc from ${TABLE} where kind = any($1)`, [kinds]);
  const rows = stored.map((r) => {
    if (r.doc?.enc === undefined) return r; // a plain row from before the key: sealed on its next save
    if (!box) throw new Error("These records are encrypted: set DATA_ENCRYPTION_KEY to the key they were written with.");
    return { ...r, doc: box.open(r.kind, r.id, r.doc) };
  });

  let chain = Promise.resolve();
  let failure = null;
  // Writes are coalesced: several saves of one record before its write starts become ONE write of
  // its latest state (a chat message changes a purse several times). Order is kept per record, and
  // flush() still waits for every change so far.
  const latest = new Map(); // "kind\0id" → { kind, id, doc } waiting to be written
  const keyOf = (kind, id) => `${kind}\u0000${id}`;
  return {
    rows,
    save(kind, id, doc) {
      const key = keyOf(kind, id);
      const queued = latest.has(key);
      latest.set(key, { kind, id, doc });
      if (queued) return; // the write already queued will carry this state
      chain = chain
        .then(() => {
          const item = latest.get(key);
          latest.delete(key);
          if (!item) return; // removed before it was written
          const json = JSON.stringify(box ? box.seal(item.kind, item.id, item.doc) : item.doc);
          return pool.query(
            `insert into ${TABLE} (kind, id, doc) values ($1, $2, $3::jsonb)
             on conflict (kind, id) do update set doc = excluded.doc, updated_at = now()`, [item.kind, item.id, json]);
        })
        .catch((err) => { failure = err; log.error?.(`database write failed (${kind} ${id}): ${err.message}`); });
    },
    // Deleted for good (an account the daughter closed): the row goes, not just its contents.
    remove(kind, id) {
      latest.delete(keyOf(kind, id));
      chain = chain
        .then(() => pool.query(`delete from ${TABLE} where kind = $1 and id = $2`, [kind, id]))
        .catch((err) => { failure = err; log.error?.(`database delete failed (${kind} ${id}): ${err.message}`); });
    },
    async flush() {
      await chain;
      if (failure) { const err = failure; failure = null; throw err; }
    },
    async close() { await chain; await pool.end(); },
  };
}

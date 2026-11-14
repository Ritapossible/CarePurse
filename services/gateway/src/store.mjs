// Orders: in Postgres when DATABASE_URL is set (they survive restarts), otherwise a JSON file.
// Status: created → fulfilling → delivered, or → failed. Changes are conditional, so two requests
// for the same order can never both deliver. A delivered order keeps its token.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { openRecords } from "./records.mjs";

// Use this to start the gateway: Postgres if a URL is given, the JSON file otherwise.
export async function openStore({ file, databaseUrl, log } = {}) {
  if (!databaseUrl) return createStore(file);
  const records = await openRecords(databaseUrl, ["order", "tx"], { log });
  return createStore(null, { records });
}

export function createStore(file, { records = null } = {}) {
  let state = { orders: {}, usedTx: {} };
  if (records) {
    for (const r of records.rows) {
      if (r.kind === "order") state.orders[r.id] = r.doc;
      if (r.kind === "tx") state.usedTx[r.id] = r.doc.orderId;
    }
  } else if (file && fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, "utf8"));

  const saveOrder = (id) => { records?.save("order", id, state.orders[id]); save(); };
  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  };

  return {
    create({ utility, ngn, destination, amount, feeNgn, chargedNgn, ttlMinutes, network, disco, contactPhone }) {
      const id = crypto.randomBytes(8).toString("hex");
      const now = Date.now();
      const order = {
        id, utility, ngn, destination, amount,
        ...(feeNgn !== undefined ? { feeNgn, chargedNgn } : {}),
        ...(network ? { network } : {}),
        ...(disco ? { disco } : {}),
        ...(contactPhone ? { contactPhone } : {}),
        status: "created",
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMinutes * 60_000).toISOString(),
      };
      state.orders[id] = order;
      saveOrder(id);
      return { ...order };
    },

    get(id) {
      const order = state.orders[id];
      return order ? { ...order } : null;
    },

    // Find an order by its on-chain reference: the purse contract stores sha256(order id), so an
    // open order can be settled even if the agent lost the id.
    getByRef(refHex) {
      const want = String(refHex).toLowerCase();
      const order = Object.values(state.orders).find((o) => crypto.createHash("sha256").update(o.id).digest("hex") === want);
      return order ? { ...order } : null;
    },

    // Move an order on only if it is still in the expected status. Returns the new order, or null.
    transition(id, from, to, extra = {}) {
      const order = state.orders[id];
      if (!order || order.status !== from) return null;
      Object.assign(order, extra, { status: to, updatedAt: new Date().toISOString() });
      saveOrder(id);
      return { ...order };
    },

    // One Stellar transaction settles one order, ever.
    claimTransaction(txHash, orderId) {
      if (state.usedTx[txHash] && state.usedTx[txHash] !== orderId) return false;
      state.usedTx[txHash] = orderId;
      records?.save("tx", txHash, { orderId });
      save();
      return true;
    },

    // Wait until every change so far is stored (database writes are queued in order).
    flush: async () => { await records?.flush(); },
    close: async () => { await records?.close(); },
  };
}

export const isExpired = (order, now = Date.now()) => Date.parse(order.expiresAt) < now;

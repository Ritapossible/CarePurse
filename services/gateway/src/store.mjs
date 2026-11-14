// Orders, kept in a small JSON file. Good enough for the hackathon; swap for a database later.
// Status: created → fulfilling → delivered, or → failed. Changes are conditional,
// so two requests for the same order can never both deliver.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function createStore(file) {
  let state = { orders: {}, usedTx: {} };
  if (file && fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, "utf8"));

  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  };

  return {
    create({ utility, ngn, destination, amount, ttlMinutes, network, disco, contactPhone }) {
      const id = crypto.randomBytes(8).toString("hex");
      const now = Date.now();
      const order = {
        id, utility, ngn, destination, amount,
        ...(network ? { network } : {}),
        ...(disco ? { disco } : {}),
        ...(contactPhone ? { contactPhone } : {}),
        status: "created",
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMinutes * 60_000).toISOString(),
      };
      state.orders[id] = order;
      save();
      return { ...order };
    },

    get(id) {
      const order = state.orders[id];
      return order ? { ...order } : null;
    },

    // Move an order on only if it is still in the expected status. Returns the new order, or null.
    transition(id, from, to, extra = {}) {
      const order = state.orders[id];
      if (!order || order.status !== from) return null;
      Object.assign(order, extra, { status: to, updatedAt: new Date().toISOString() });
      save();
      return { ...order };
    },

    // One Stellar transaction settles one order, ever.
    claimTransaction(txHash, orderId) {
      if (state.usedTx[txHash] && state.usedTx[txHash] !== orderId) return false;
      state.usedTx[txHash] = orderId;
      save();
      return true;
    },
  };
}

export const isExpired = (order, now = Date.now()) => Date.parse(order.expiresAt) < now;

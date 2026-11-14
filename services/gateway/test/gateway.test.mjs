// Offline tests: a fake facilitator stands in for Coinbase / Built on Stellar, so no money moves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { createApp } from "../src/server.mjs";
import { createStore } from "../src/store.mjs";
import { createMockProvider } from "../src/provider.mjs";
import { options, priceBaseUnits } from "../src/catalog.mjs";
import { config as baseConfig } from "../src/config.mjs";

const recipient = Keypair.random().publicKey();
const config = { ...baseConfig, recipient, ordersFile: null, ngnPerUsdc: 1470 };
const fakeFacilitator = {
  getSupported: async () => ({
    kinds: [{ x402Version: 2, scheme: "exact", network: "stellar:testnet", extra: { areFeesSponsored: true } }],
    extensions: [],
    signers: {},
  }),
  verify: async () => { throw new Error("not used in these tests"); },
  settle: async () => { throw new Error("not used in these tests"); },
};
const quiet = { info() {}, warn() {}, error() {} };

async function startGateway(overrides = {}) {
  const app = createApp({ config, store: createStore(null), provider: createMockProvider(), facilitatorClient: fakeFacilitator, log: quiet, ...overrides });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("prices are exact USDC base units, rounded up", () => {
  assert.equal(priceBaseUnits(1470, 1470), "10000000"); // ₦1,470 = 1 USDC
  assert.equal(priceBaseUnits(5000, 1470), "34013606"); // 3.4013605… rounded up
  assert.equal(priceBaseUnits(100, 1470), "680273");
});

test("minimums: electricity from ₦500, airtime and data from ₦100", () => {
  assert.equal(options("electricity", { ngnPerUsdc: 1470 })[0].ngn, 500);
  assert.equal(options("airtime", { ngnPerUsdc: 1470 })[0].ngn, 100);
  assert.equal(options("data", { ngnPerUsdc: 1470 })[0].ngn, 100);
  assert.deepEqual(options("airtime", { ngnPerUsdc: 1470, maxNgn: 500 }).map((o) => o.ngn), [100, 200, 500]);
});

test("the paid route answers 402 with the exact price, network and payee", async () => {
  const gw = await startGateway();
  try {
    const { order, payPath } = await (await post(`${gw.base}/v1/orders`, { utility: "electricity", ngn: 5000, destination: "45012345678" })).json();
    const res = await fetch(`${gw.base}${payPath}`);
    assert.equal(res.status, 402);
    const required = decodePaymentRequiredHeader(res.headers.get("payment-required"));
    const [accept] = required.accepts;
    assert.equal(accept.scheme, "exact");
    assert.equal(accept.network, "stellar:testnet");
    assert.equal(accept.amount, order.amount);
    assert.equal(accept.amount, "34013606");
    assert.equal(accept.asset, config.usdc.contractId);
    assert.equal(accept.payTo, recipient);
  } finally { await gw.close(); }
});

test("bad orders are refused before any payment is asked for", async () => {
  const gw = await startGateway();
  try {
    assert.equal((await fetch(`${gw.base}/paid/topup/electricity/5000`)).status, 400); // no order
    assert.equal((await fetch(`${gw.base}/paid/topup/electricity/300`)).status, 404); // below the minimum
    const { order } = await (await post(`${gw.base}/v1/orders`, { utility: "airtime", ngn: 100, destination: "08031234567" })).json();
    assert.equal((await fetch(`${gw.base}/paid/topup/airtime/200?order=${order.id}`)).status, 400); // wrong size
    assert.equal((await post(`${gw.base}/v1/orders`, { utility: "electricity", ngn: 100, destination: "45012345678" })).status, 400);
    assert.equal((await post(`${gw.base}/v1/orders`, { utility: "airtime", ngn: 100, destination: "12345" })).status, 400);
  } finally { await gw.close(); }
});

test("without a valid recipient, paid routes fail closed with 503", async () => {
  const gw = await startGateway({ config: { ...config, recipient: "" } });
  try {
    assert.equal((await fetch(`${gw.base}/paid/topup/electricity/500?order=x`)).status, 503);
  } finally { await gw.close(); }
});

test("options endpoint lists sizes and prices for people to read", async () => {
  const gw = await startGateway();
  try {
    const body = await (await fetch(`${gw.base}/v1/options?utility=data&max_ngn=200`)).json();
    assert.deepEqual(body.options.map((o) => [o.ngn, o.usdc]), [[100, "0.07"], [200, "0.14"]]);
  } finally { await gw.close(); }
});

// A whole paid delivery with a facilitator that verifies and settles (no real money).
test("after a paid delivery, the token is kept on the order and can be looked up again", async () => {
  const { encodePaymentSignatureHeader } = await import("@x402/core/http");
  const settling = {
    ...fakeFacilitator,
    verify: async () => ({ isValid: true, payer: "GPAYER" }),
    settle: async () => ({ success: true, transaction: "a".repeat(64), network: "stellar:testnet", payer: "GPAYER" }),
  };
  const gw = await startGateway({ facilitatorClient: settling });
  try {
    const { order, payPath } = await (await post(`${gw.base}/v1/orders`, { utility: "electricity", ngn: 500, destination: "1111111111111" })).json();
    const required = decodePaymentRequiredHeader((await fetch(`${gw.base}${payPath}`)).headers.get("payment-required"));
    const signature = encodePaymentSignatureHeader({ x402Version: 2, resource: required.resource, accepted: required.accepts[0], payload: { transaction: "AAAA" } });
    const paid = await fetch(`${gw.base}${payPath}`, { headers: { "PAYMENT-SIGNATURE": signature } });
    assert.equal(paid.status, 200);
    const body = await paid.json();
    assert.match(body.token, /^\d{4}( \d{4}){4}$/);
    // Later, from the order record alone:
    await new Promise((r) => setTimeout(r, 50)); // the delivery is recorded when the response finishes
    const looked = await (await fetch(`${gw.base}/v1/orders/${order.id}`)).json();
    assert.equal(looked.order.status, "delivered");
    assert.equal(looked.order.token, body.token);
    assert.ok(looked.order.units);
  } finally { await gw.close(); }
});

test("an order can be found by the purse contract's reference (sha256 of its id)", async () => {
  const { createHash } = await import("node:crypto");
  const gw = await startGateway();
  try {
    const { order } = await (await post(`${gw.base}/v1/orders`, { utility: "airtime", ngn: 100, destination: "08011111111" })).json();
    const ref = createHash("sha256").update(order.id).digest("hex");
    assert.equal((await (await fetch(`${gw.base}/v1/orders/by-ref/${ref}`)).json()).order.id, order.id);
    assert.equal((await fetch(`${gw.base}/v1/orders/by-ref/${"0".repeat(64)}`)).status, 404);
    assert.equal((await fetch(`${gw.base}/v1/orders/by-ref/nothex`)).status, 400);
  } finally { await gw.close(); }
});

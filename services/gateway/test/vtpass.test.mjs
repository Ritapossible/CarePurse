// Offline tests for the VTpass sandbox provider, against a fake VTpass. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createVtpassProvider, vtpassRequestId } from "../src/provider.mjs";

function fakeVtpass(replies) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.replace("https://sandbox.vtpass.com/api", "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method: init.method, headers: init.headers, body });
    const reply = typeof replies[path.split("?")[0]] === "function" ? replies[path.split("?")[0]](body, calls) : replies[path.split("?")[0]];
    return { status: 200, json: async () => reply };
  };
  const provider = createVtpassProvider({
    baseUrl: "https://sandbox.vtpass.com/api", apiKey: "A", secretKey: "S", publicKey: "P", contactPhone: "08011111111",
    fetchImpl, clock: () => Date.parse("2026-11-14T15:07:00Z"), wait: async () => {},
  });
  return { provider, calls };
}

const delivered = (extra = {}) => ({ code: "000", response_description: "TRANSACTION SUCCESSFUL", content: { transactions: { status: "delivered" } }, ...extra });

test("request_id starts with Lagos time YYYYMMDDHHII", () => {
  const id = vtpassRequestId(Date.parse("2026-11-14T15:07:00Z"));
  assert.match(id, /^202611141607[0-9a-f]{12}$/);
});

test("electricity: verify the meter, then buy and return the token", async () => {
  const { provider, calls } = fakeVtpass({
    "/merchant-verify": { code: "000", content: { Customer_Name: "TEST METER", Address: "Lagos", WrongBillersCode: false } },
    "/pay": delivered({ purchased_code: "Token : 26362054405982757802", units: "79.9 kWh" }),
  });
  const meter = await provider.lookupMeter("1111111111111");
  assert.equal(meter.ownerName, "TEST METER");
  const r = await provider.purchase({ utility: "electricity", ngn: 500, destination: "1111111111111", contactPhone: "08011111111" });
  assert.equal(r.ok, true);
  assert.equal(r.token, "2636 2054 4059 8275 7802");
  assert.equal(r.units, "79.9 kWh");
  const pay = calls.find((c) => c.path === "/pay");
  assert.deepEqual(pay.headers, { "api-key": "A", "secret-key": "S", "content-type": "application/json" });
  assert.equal(pay.body.serviceID, "ikeja-electric");
  assert.equal(pay.body.variation_code, "prepaid");
  assert.equal(pay.body.amount, 500);
});

test("airtime goes to the network's serviceID; data is sold only at exact bundle prices", async () => {
  const { provider, calls } = fakeVtpass({
    "/pay": delivered(),
    "/service-variations": { content: { variations: [
      { variation_code: "mtn-100", name: "100MB", variation_amount: "100" },
      { variation_code: "mtn-200", name: "200MB", variation_amount: "200" },
      { variation_code: "mtn-1000", name: "1.5GB", variation_amount: "1000" },
      { variation_code: "mtn-xtratalk-500", name: "MTN N500 Xtratalk Weekly Bundle", variation_amount: "500" },
    ] } },
  });
  assert.equal((await provider.purchase({ utility: "airtime", ngn: 100, destination: "08011111111", network: "glo" })).ok, true);
  assert.equal(calls.at(-1).body.serviceID, "glo");
  // ₦500: only a talk bundle costs ₦500, so no data is bought (Mama is never charged ₦500 for less).
  assert.equal((await provider.purchase({ utility: "data", ngn: 500, destination: "08011111111", network: "mtn" })).ok, false);
  assert.deepEqual([...(await provider.dataTiers("mtn"))].sort((a, b) => a - b), [100, 200, 1000]);
  const data = await provider.purchase({ utility: "data", ngn: 200, destination: "08011111111", network: "mtn" });
  assert.equal(data.bundle, "200MB");
  const get = calls.find((c) => c.method === "GET");
  assert.deepEqual(get.headers, { "api-key": "A", "public-key": "P" });
  assert.equal(calls.at(-1).body.serviceID, "mtn-data");
  assert.equal(calls.at(-1).body.variation_code, "mtn-200");
});

test("a failed or stuck purchase is reported as not ok, so x402 doesn't settle", async () => {
  const failed = fakeVtpass({ "/pay": { code: "016", response_description: "TRANSACTION FAILED", content: { transactions: { status: "failed" } } } });
  assert.equal((await failed.provider.purchase({ utility: "airtime", ngn: 100, destination: "08099999999" })).ok, false);
  const pending = fakeVtpass({ "/pay": { code: "099", content: { transactions: { status: "pending" } } }, "/requery": { code: "099", content: { transactions: { status: "pending" } } } });
  assert.equal((await pending.provider.purchase({ utility: "airtime", ngn: 100, destination: "08011111111" })).ok, false);
  assert.equal(pending.calls.filter((c) => c.path === "/requery").length, 3);
});

test("a pending purchase that becomes delivered on requery succeeds", async () => {
  const { provider } = fakeVtpass({ "/pay": { code: "099", content: { transactions: { status: "pending" } } }, "/requery": delivered() });
  assert.equal((await provider.purchase({ utility: "airtime", ngn: 100, destination: "08011111111" })).ok, true);
});

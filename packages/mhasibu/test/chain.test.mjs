// The chain helpers: one transaction at a time per account, retries, and the send outcomes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSoroban, retryOnBadSeq, withAccount } from "../src/purse-contract.mjs";

test("one account's transactions never overlap; other accounts run in parallel", async () => {
  const events = [];
  const job = (acct, name, ms) => withAccount(acct, async () => { events.push(`${name}+`); await new Promise((r) => setTimeout(r, ms)); events.push(`${name}-`); return name; });
  const results = await Promise.all([job("OP", "a", 30), job("OP", "b", 5), job("OTHER", "x", 5), job("OP", "c", 1)]);
  assert.deepEqual(results, ["a", "b", "x", "c"]);
  const op = events.filter((e) => /^[abc]/.test(e));
  assert.deepEqual(op, ["a+", "a-", "b+", "b-", "c+", "c-"]); // strictly one after another
  assert.ok(events.indexOf("x+") < events.indexOf("a-")); // OTHER didn't wait for OP
  // A failure doesn't block the queue.
  await assert.rejects(withAccount("OP", async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await withAccount("OP", async () => "after"), "after");
});

test("a stale sequence number is rebuilt and retried; other errors are not", async () => {
  let n = 0;
  assert.equal(await retryOnBadSeq(async () => { n++; if (n < 3) throw Object.assign(new Error("send failed: txBadSeq"), { badSeq: true }); return "ok"; }), "ok");
  assert.equal(n, 3);
  let m = 0;
  await assert.rejects(retryOnBadSeq(async () => { m++; throw new Error("real failure"); }), /real failure/);
  assert.equal(m, 1);
});

test("submit: a busy node is retried, a duplicate is awaited, a bad sequence is flagged", async () => {
  const soroban = createSoroban({ rpcUrl: "https://fake-rpc.invalid" });
  const tx = { hash: () => Buffer.alloc(32) };
  let calls = [];
  soroban.server.pollTransaction = async () => ({ status: "SUCCESS" });
  soroban.server.sendTransaction = async () => { calls.push("send"); return calls.length < 2 ? { status: "TRY_AGAIN_LATER" } : { status: "PENDING", hash: "h1" }; };
  assert.equal((await soroban.submit(tx)).hash, "h1");
  assert.equal(calls.length, 2);
  soroban.server.sendTransaction = async () => ({ status: "DUPLICATE", hash: "h2" });
  assert.equal((await soroban.submit(tx)).hash, "h2");
  soroban.server.sendTransaction = async () => ({ status: "ERROR", errorResult: { result: () => ({ switch: () => ({ name: "txBadSeq" }) }) } });
  const err = await soroban.submit(tx).catch((e) => e);
  assert.equal(err.badSeq, true);
  assert.equal(createSoroban({ rpcUrl: "https://fake-rpc.invalid" }), soroban); // one client per address
});

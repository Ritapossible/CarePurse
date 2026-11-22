// The purse contract on Soroban (contracts/purse): calls from JavaScript.
// Mhasibu calls `buy` before every x402 payment. The contract checks the guardian's caps and
// saved destinations, then sends exactly that amount of USDC to the agent wallet.
import crypto from "node:crypto";
import { Address, BASE_FEE, Contract, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

// Must match `enum Error` in contracts/purse/src/lib.rs.
export const CONTRACT_ERRORS = {
  1: "paused", 2: "no caps", 3: "per top-up", 4: "per day", 5: "per week", 6: "per month",
  7: "purse month", 8: "destination", 9: "bad amount", 10: "purse balance", 11: "order used",
  12: "no order", 13: "already refunded", 14: "not latest order", 15: "order open", 16: "already committed",
};

export const sha256 = (text) => crypto.createHash("sha256").update(String(text)).digest();
export const symbol = (s) => nativeToScVal(s, { type: "symbol" });
export const i128 = (n) => nativeToScVal(BigInt(n), { type: "i128" });
export const bytes32 = (buf) => xdr.ScVal.scvBytes(Buffer.from(buf));

// A face-value naira limit as an on-chain cap in USDC base units (7 decimals). The purse pays face
// value + the service fee, so the cap includes the fee, rounded up like the gateway's prices, plus
// one base unit per possible top-up, so rounding never makes the contract stricter than the code.
export function capBaseUnits(ngn, ngnPerUsdc, minTopupNgn, decimals = 7, feeBps = 0) {
  if (!ngn) return 0n;
  const scale = 10n ** BigInt(decimals);
  const rate = BigInt(Math.round(ngnPerUsdc * 1e6));
  const num = BigInt(ngn) * BigInt(10_000 + feeBps) * scale * 1_000_000n;
  const den = rate * 10_000n;
  return (num + den - 1n) / den + BigInt(Math.ceil(ngn / minTopupNgn));
}

// The rate the on-chain caps are written with: the naira can strengthen after setup, making each
// top-up cost more USDC, so the caps leave room for that (CAP_RATE_MARGIN_BPS, default 20%).
// Mhasibu still enforces the exact naira limits in code; the contract stays the hard backstop.
export const capRate = (config) => (config.ngnPerUsdc * 10_000) / (10_000 + (config.capRateMarginBps ?? 2000));

export function contractErrorCode(message) {
  const m = String(message).match(/Error\(Contract, #(\d+)\)/);
  return m ? Number(m[1]) : null;
}

export class ContractRefused extends Error {
  constructor(code, detail) {
    super(`contract refused: ${CONTRACT_ERRORS[code] ?? code}`);
    this.code = code;
    this.rule = CONTRACT_ERRORS[code] ?? `error ${code}`;
    this.detail = detail;
  }
}

// Every transaction from one account uses that account's next sequence number, so two built at the
// same moment collide (tx_bad_seq). One queue per source account, for the whole process: deploys,
// guardian calls, wallet creation, top-ups and the shared agent's buy/commit/refund all line up.
// `inOrder` is the general form: one job at a time per key (also used for Mhasibu's chat queues).
const queues = new Map();
export function inOrder(key, fn) {
  const before = queues.get(key) ?? Promise.resolve();
  const run = before.then(fn, fn);
  const settled = run.then(() => {}, () => {});
  queues.set(key, settled);
  settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
  return run;
}
export const withAccount = (publicKey, fn) => inOrder(`account:${publicKey}`, fn);

// A stale sequence number (another process, or a transaction the network dropped): rebuild and
// try again, a few times. Anything else is a real failure.
export async function retryOnBadSeq(fn, tries = 3) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (err) {
      if (!err?.badSeq || i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}

// One client per RPC address (they hold connections; the calls are many).
const clients = new Map();
export function createSoroban({ rpcUrl, networkPassphrase = Networks.TESTNET }) {
  const key = `${rpcUrl}|${networkPassphrase}`;
  if (!clients.has(key)) clients.set(key, makeSoroban({ rpcUrl, networkPassphrase }));
  return clients.get(key);
}

function makeSoroban({ rpcUrl, networkPassphrase }) {
  const server = new rpc.Server(rpcUrl);

  async function build(sourcePublicKey, operation) {
    const account = await server.getAccount(sourcePublicKey);
    return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase }).addOperation(operation).setTimeout(60).build();
  }

  // Storage left unused long enough is archived by the network. A simulation then says "restore
  // first": send that restore (paid by `payer`, any account can), and the caller simulates again.
  // Returns true when a restore was sent. Must run inside `payer`'s queue.
  async function restoreIfArchived(sim, payer) {
    if (!rpc.Api.isSimulationRestore(sim)) return false;
    const account = await server.getAccount(payer.publicKey());
    const fee = String(Number(BASE_FEE) + Number(sim.restorePreamble.minResourceFee));
    const restore = new TransactionBuilder(account, { fee, networkPassphrase })
      .setSorobanData(sim.restorePreamble.transactionData.build())
      .addOperation(Operation.restoreFootprint({}))
      .setTimeout(60)
      .build();
    restore.sign(payer);
    await submit(restore);
    return true;
  }

  // Simulate, then sign and send, in the signer's queue (retried on a stale sequence number). A
  // contract error during simulation means the contract said no: nothing is signed or sent.
  // Archived storage is restored first, then the call is simulated again.
  function send(signer, operation) {
    return withAccount(signer.publicKey(), () => retryOnBadSeq(async () => {
      let tx = await build(signer.publicKey(), operation);
      let sim = await server.simulateTransaction(tx);
      if (!rpc.Api.isSimulationError(sim) && (await restoreIfArchived(sim, signer))) {
        tx = await build(signer.publicKey(), operation);
        sim = await server.simulateTransaction(tx);
      }
      if (rpc.Api.isSimulationError(sim)) {
        const code = contractErrorCode(sim.error);
        if (code) throw new ContractRefused(code, sim.error);
        throw new Error(`simulation failed: ${sim.error.slice(0, 300)}`);
      }
      const prepared = rpc.assembleTransaction(tx, sim).build();
      prepared.sign(signer);
      return submit(prepared);
    }));
  }

  // Send a signed transaction and wait for its result. TRY_AGAIN_LATER (the node is busy) is sent
  // again; DUPLICATE means it was already received, so its result is awaited; a bad sequence number
  // is marked so the caller can rebuild (retryOnBadSeq).
  async function submit(signedTx) {
    let sent;
    for (let i = 0; i < 4; i++) {
      sent = await server.sendTransaction(signedTx);
      if (sent.status !== "TRY_AGAIN_LATER") break;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
    if (sent.status === "TRY_AGAIN_LATER") throw new Error("the network is busy; try again in a moment");
    if (sent.status === "ERROR") {
      const code = sent.errorResult?.result().switch().name ?? "unknown";
      const err = new Error(`send failed: ${code}`);
      err.badSeq = code === "txBadSeq";
      throw err;
    }
    const done = await server.pollTransaction(sent.hash, { attempts: 30 });
    if (done.status !== "SUCCESS") {
      const err = new Error(`transaction ${done.status}`);
      err.hash = sent.hash;
      throw err;
    }
    return { hash: sent.hash, returnValue: done.returnValue ? scValToNative(done.returnValue) : undefined };
  }

  // Read-only call (simulation only, no fee).
  async function read(contractId, method, args = [], sourcePublicKey) {
    const tx = await build(sourcePublicKey, new Contract(contractId).call(method, ...args));
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error.slice(0, 300));
    return scValToNative(sim.result.retval);
  }

  return {
    server,
    send,
    submit,
    read,
    restoreIfArchived,
    invoke: (signer, contractId, method, args) => send(signer, new Contract(contractId).call(method, ...args)),
  };
}

export const refundArgs = (orderId) => [bytes32(sha256(orderId))];
export const commitArgs = refundArgs;
export const orderRef = (orderId) => sha256(orderId).toString("hex");
// The same, from the raw on-chain reference (hex), for an order whose id was lost.
export const refArgs = (refHex) => [bytes32(Buffer.from(refHex, "hex"))];

// The fingerprint of a saved meter or phone, as the contract stores it. A keyed hash (HMAC-SHA256)
// salted with the purse's contract id: the ledger shows neither the number nor a plain sha256 that
// could be found by trying every number, and the same meter gives different fingerprints in
// different purses. `key` is config.destHashKey (DEST_HASH_KEY, or derived from the agent secret).
export function destHash(destination, { key, contractId }) {
  if (!key) throw new Error("No destination hash key: set DEST_HASH_KEY or AGENT_SECRET_KEY.");
  if (!contractId) throw new Error("destHash needs the purse contract id.");
  return crypto.createHmac("sha256", key).update(`carepurse/dest/v1:${contractId}:${destination}`).digest();
}

// The arguments of `buy`, built the same way everywhere.
export function buyArgs({ utility, destination, amount, orderId, key, contractId }) {
  return [symbol(utility), bytes32(destHash(destination, { key, contractId })), i128(amount), bytes32(sha256(orderId))];
}

export const addressVal = (a) => new Address(a).toScVal();
export const keypair = (secret) => Keypair.fromSecret(secret);

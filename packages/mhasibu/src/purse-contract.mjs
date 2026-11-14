// The purse contract on Soroban (contracts/purse): calls from JavaScript.
// Mhasibu calls `buy` before every x402 payment. The contract checks the guardian's caps and
// saved destinations, then sends exactly that amount of USDC to the agent wallet.
import crypto from "node:crypto";
import { Address, BASE_FEE, Contract, Keypair, Networks, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

// Must match `enum Error` in contracts/purse/src/lib.rs.
export const CONTRACT_ERRORS = {
  1: "paused", 2: "no caps", 3: "per top-up", 4: "per day", 5: "per week", 6: "per month",
  7: "purse month", 8: "destination", 9: "bad amount", 10: "purse balance", 11: "order used",
  12: "no order", 13: "already refunded",
};

export const sha256 = (text) => crypto.createHash("sha256").update(String(text)).digest();
export const symbol = (s) => nativeToScVal(s, { type: "symbol" });
export const i128 = (n) => nativeToScVal(BigInt(n), { type: "i128" });
export const bytes32 = (buf) => xdr.ScVal.scvBytes(Buffer.from(buf));

// Naira to USDC base units (7 decimals), rounded up like the gateway's prices. Caps add one
// base unit per possible top-up, so rounding never makes the contract stricter than the code.
export function capBaseUnits(ngn, ngnPerUsdc, minTopupNgn, decimals = 7) {
  if (!ngn) return 0n;
  const scale = 10n ** BigInt(decimals);
  const rate = BigInt(Math.round(ngnPerUsdc * 1e6));
  const base = (BigInt(ngn) * scale * 1_000_000n + rate - 1n) / rate;
  return base + BigInt(Math.ceil(ngn / minTopupNgn));
}

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

export function createSoroban({ rpcUrl, networkPassphrase = Networks.TESTNET }) {
  const server = new rpc.Server(rpcUrl);

  async function build(sourcePublicKey, operation) {
    const account = await server.getAccount(sourcePublicKey);
    return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase }).addOperation(operation).setTimeout(60).build();
  }

  // Simulate, then sign and send. A contract error during simulation means the contract said no
  // and nothing is signed or sent.
  async function send(signer, operation) {
    const tx = await build(signer.publicKey(), operation);
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      const code = contractErrorCode(sim.error);
      if (code) throw new ContractRefused(code, sim.error);
      throw new Error(`simulation failed: ${sim.error.slice(0, 300)}`);
    }
    const prepared = rpc.assembleTransaction(tx, sim).build();
    prepared.sign(signer);
    return submit(prepared, sim);
  }

  async function submit(signedTx) {
    const sent = await server.sendTransaction(signedTx);
    if (sent.status === "ERROR") throw new Error(`send failed: ${sent.errorResult?.result().switch().name ?? "unknown"}`);
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
    invoke: (signer, contractId, method, args) => send(signer, new Contract(contractId).call(method, ...args)),
  };
}

// The argument of `refund`: the same order reference `buy` was given.
export const refundArgs = (orderId) => [bytes32(sha256(orderId))];

// The arguments of `buy`, built the same way everywhere.
export function buyArgs({ utility, destination, amount, orderId }) {
  return [symbol(utility), bytes32(sha256(destination)), i128(amount), bytes32(sha256(orderId))];
}

export const addressVal = (a) => new Address(a).toScVal();
export const keypair = (secret) => Keypair.fromSecret(secret);

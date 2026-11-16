// Uploads the purse contract's code (wasm) to Stellar testnet once, and saves its hash as
// PURSE_WASM_HASH in the root .env. Mhasibu then deploys one purse contract per family from it
// at sign-up (the daughter's Privy wallet as guardian). Paid by the agent wallet (test XLM).
// Build first: cd contracts/purse && stellar contract build
// Usage: npm run install-wasm            Testnet only.
import fs from "node:fs";
import path from "node:path";
import { Keypair, Operation } from "@stellar/stellar-sdk";
import { config, repoRoot } from "../src/config.mjs";
import { createSoroban } from "../src/purse-contract.mjs";

const wasmFile = path.join(repoRoot, "contracts/purse/target/wasm32v1-none/release/carepurse_purse.wasm");
if (!fs.existsSync(wasmFile)) { console.error(`No wasm at ${wasmFile}. Run: cd contracts/purse && stellar contract build`); process.exit(1); }
const soroban = createSoroban({ rpcUrl: config.rpcUrl });
const up = await soroban.send(Keypair.fromSecret(config.agentSecret), Operation.uploadContractWasm({ wasm: fs.readFileSync(wasmFile) }));
const hash = Buffer.from(up.returnValue).toString("hex");
const envFile = path.join(repoRoot, ".env");
let text = fs.readFileSync(envFile, "utf8");
text = /^PURSE_WASM_HASH=/m.test(text) ? text.replace(/^PURSE_WASM_HASH=.*$/m, `PURSE_WASM_HASH=${hash}`) : `${text.trimEnd()}\nPURSE_WASM_HASH=${hash}\n`;
fs.writeFileSync(envFile, text);
console.log(`✓ purse wasm uploaded: ${hash} · ${config.explorerUrl}/tx/${up.hash}`);
console.log("  saved as PURSE_WASM_HASH in .env (set the same value on Render for Mhasibu)");

// Upgrades the live purse contract to the freshly built wasm: same address, same USDC, same
// caps and orders. The guardian signs. New versions must keep the storage keys and record shapes
// compatible (see contracts/purse/README.md).
// Build first: cd contracts/purse && stellar contract build
// Usage: npm run upgrade-purse            Testnet only.
import fs from "node:fs";
import path from "node:path";
import { Operation } from "@stellar/stellar-sdk";
import { config, repoRoot } from "../src/config.mjs";
import { bytes32, createSoroban, keypair } from "../src/purse-contract.mjs";

const wasmFile = path.join(repoRoot, "contracts/purse/target/wasm32v1-none/release/carepurse_purse.wasm");
if (!config.purseContractId) { console.error("No PURSE_CONTRACT_ID. Run: npm run deploy-purse"); process.exit(1); }
if (!fs.existsSync(wasmFile)) { console.error(`No wasm at ${wasmFile}. Run: cd contracts/purse && stellar contract build`); process.exit(1); }
const secret = process.env.GUARDIAN_SECRET?.trim();
if (!secret) { console.error("GUARDIAN_SECRET missing in .env"); process.exit(1); }
const guardian = keypair(secret);
const soroban = createSoroban({ rpcUrl: config.rpcUrl });
const link = (h) => `${config.explorerUrl}/tx/${h}`;

const up = await soroban.send(guardian, Operation.uploadContractWasm({ wasm: fs.readFileSync(wasmFile) }));
const hash = Buffer.from(up.returnValue);
console.log(`✓ uploaded the new wasm ${hash.toString("hex").slice(0, 12)}… · ${link(up.hash)}`);
const done = await soroban.invoke(guardian, config.purseContractId, "upgrade", [bytes32(hash)]);
console.log(`✓ upgraded ${config.purseContractId} in place · ${link(done.hash)}`);
const cap = await soroban.read(config.purseContractId, "purse_cap", [], guardian.publicKey());
console.log(`  still the same purse: purse cap ${Number(cap) / 1e7} USDC`);

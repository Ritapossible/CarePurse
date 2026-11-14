// Deploys the purse contract to Stellar testnet and sets it up for the demo purse.
//   1. guardian wallet (the daughter; Privy later): created and funded with Friendbot if missing
//   2. upload contracts/purse wasm, create the contract (guardian, agent, USDC)
//   3. guardian saves the caps (the purse's preset, in USDC base units) and the destinations
//   4. the agent wallet's USDC moves into the contract, so the agent holds nothing between top-ups
//   5. PURSE_CONTRACT_ID is written to the root .env
// Build the wasm first: cd contracts/purse && stellar contract build
// Usage: npm run deploy-purse            Testnet only.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Address, Horizon, Keypair, Operation } from "@stellar/stellar-sdk";
import { config, repoRoot } from "../src/config.mjs";
import { createPurseStore } from "../src/purses.mjs";
import { addressVal, bytes32, capBaseUnits, createSoroban, i128, sha256, symbol } from "../src/purse-contract.mjs";
import { xdr } from "@stellar/stellar-sdk";

const MIN_TOPUP = { electricity: 500, airtime: 100, data: 100 };
const wasmFile = path.join(repoRoot, "contracts/purse/target/wasm32v1-none/release/carepurse_purse.wasm");
if (!fs.existsSync(wasmFile)) { console.error(`No wasm at ${wasmFile}. Run: cd contracts/purse && stellar contract build`); process.exit(1); }

const envFile = path.join(repoRoot, ".env");
let text = fs.readFileSync(envFile, "utf8");
const read = (key) => (text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1] ?? "").trim();
const write = (key, value) => {
  text = new RegExp(`^${key}=`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
  fs.writeFileSync(envFile, text);
};

// 1. Guardian wallet
let guardianSecret = read("GUARDIAN_SECRET");
if (!guardianSecret) { guardianSecret = Keypair.random().secret(); write("GUARDIAN_SECRET", guardianSecret); }
const guardian = Keypair.fromSecret(guardianSecret);
const agent = Keypair.fromSecret(config.agentSecret);
const horizon = new Horizon.Server(config.horizonUrl);
try { await horizon.loadAccount(guardian.publicKey()); }
catch {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${guardian.publicKey()}`);
  if (!res.ok) throw new Error(`Friendbot could not fund the guardian wallet (HTTP ${res.status})`);
  console.log(`  funded the guardian wallet ${guardian.publicKey()} with test XLM`);
}

const soroban = createSoroban({ rpcUrl: config.rpcUrl });
const link = (h) => `${config.explorerUrl}/tx/${h}`;

// 2. Upload and create
const up = await soroban.send(guardian, Operation.uploadContractWasm({ wasm: fs.readFileSync(wasmFile) }));
const wasmHash = Buffer.from(up.returnValue);
console.log(`✓ uploaded the purse wasm ${wasmHash.toString("hex").slice(0, 12)}… · ${link(up.hash)}`);
const created = await soroban.send(guardian, Operation.createCustomContract({
  address: Address.fromString(guardian.publicKey()),
  wasmHash,
  salt: crypto.randomBytes(32),
  constructorArgs: [addressVal(guardian.publicKey()), addressVal(agent.publicKey()), addressVal(config.usdc.contractId)],
}));
const contractId = created.returnValue;
console.log(`✓ created the purse contract ${contractId} · ${link(created.hash)}`);
write("PURSE_CONTRACT_ID", contractId);

// 3. Caps and destinations, from the demo purse
const purse = createPurseStore(config.pursesFile).get("demo");
const capsVal = (l, u) => xdr.ScVal.scvMap([
  ["per_day", l.perDay], ["per_month", l.perMonth], ["per_topup", l.perTopup], ["per_week", l.perWeek],
].map(([k, v]) => new xdr.ScMapEntry({ key: symbol(k), val: i128(capBaseUnits(v ?? 0, config.ngnPerUsdc, MIN_TOPUP[u])) })));
for (const [utility, limits] of Object.entries(purse.limits)) {
  const c = await soroban.invoke(guardian, contractId, "set_caps", [symbol(utility), capsVal(limits, utility)]);
  const d = await soroban.invoke(guardian, contractId, "set_destination", [symbol(utility), bytes32(sha256(purse.destinations[utility]))]);
  console.log(`✓ ${utility}: caps ₦${limits.perTopup.toLocaleString("en-NG")} per top-up, destination saved as a hash · ${link(c.hash)} · ${link(d.hash)}`);
}
const cap = await soroban.invoke(guardian, contractId, "set_purse_cap", [i128(capBaseUnits(purse.monthlyCap, config.ngnPerUsdc, 100))]);
console.log(`✓ purse cap ₦${purse.monthlyCap.toLocaleString("en-NG")} a month · ${link(cap.hash)}`);

// 4. Move the agent's USDC into the purse
const account = await horizon.loadAccount(agent.publicKey());
const usdc = account.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === config.usdc.issuer);
const units = BigInt(Math.round(Number(usdc?.balance ?? 0) * 10 ** config.usdc.decimals));
if (units > 0n) {
  const t = await soroban.invoke(agent, config.usdc.contractId, "transfer", [addressVal(agent.publicKey()), addressVal(contractId), i128(units)]);
  console.log(`✓ moved ${usdc.balance} USDC from the agent wallet into the purse · ${link(t.hash)}`);
}
console.log(`\nPURSE_CONTRACT_ID=${contractId} is in .env. Explorer: ${config.explorerUrl}/contract/${contractId}`);

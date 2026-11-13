// Creates and funds the two testnet wallets the gateway needs, and writes them into the root .env.
//   Gateway wallet: receives payments.   Agent wallet (Mhasibu): pays.
// Safe to run again: it never replaces keys that are already set.
import fs from "node:fs";
import path from "node:path";
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, BASE_FEE, Networks } from "@stellar/stellar-sdk";
import { repoRoot } from "../src/config.mjs";

const envFile = path.join(repoRoot, ".env");
if (!fs.existsSync(envFile)) {
  fs.copyFileSync(path.join(repoRoot, ".env.example"), envFile);
  console.log("Created .env from .env.example");
}
let text = fs.readFileSync(envFile, "utf8");
const read = (key) => (text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1] ?? "").trim();
const write = (key, value) => {
  text = new RegExp(`^${key}=`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`) : `${text}\n${key}=${value}\n`;
};

let gatewaySecret = read("GATEWAY_RECIPIENT_SECRET");
let agentSecret = read("AGENT_SECRET_KEY");
if (!gatewaySecret) { const kp = Keypair.random(); gatewaySecret = kp.secret(); write("GATEWAY_RECIPIENT", kp.publicKey()); write("GATEWAY_RECIPIENT_SECRET", gatewaySecret); }
if (!agentSecret) { agentSecret = Keypair.random().secret(); write("AGENT_SECRET_KEY", agentSecret); }
fs.writeFileSync(envFile, text);

const horizon = new Horizon.Server(read("STELLAR_HORIZON_URL") || "https://horizon-testnet.stellar.org");
const usdc = new Asset("USDC", read("USDC_ISSUER") || "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");

async function prepare(label, secret) {
  const kp = Keypair.fromSecret(secret);
  let account;
  try { account = await horizon.loadAccount(kp.publicKey()); }
  catch {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
    if (!res.ok) throw new Error(`Friendbot could not fund the ${label} wallet (HTTP ${res.status}).`);
    account = await horizon.loadAccount(kp.publicKey());
    console.log(`  funded ${label} wallet with test XLM`);
  }
  const hasTrustline = account.balances.some((b) => b.asset_code === "USDC" && b.asset_issuer === usdc.issuer);
  if (!hasTrustline) {
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.changeTrust({ asset: usdc }))
      .setTimeout(60)
      .build();
    tx.sign(kp);
    await horizon.submitTransaction(tx);
    console.log(`  added a USDC trustline to the ${label} wallet`);
    account = await horizon.loadAccount(kp.publicKey());
  }
  const balance = account.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === usdc.issuer)?.balance ?? "0";
  return { address: kp.publicKey(), usdc: balance };
}

console.log("Preparing testnet wallets…");
const gateway = await prepare("gateway", gatewaySecret);
const agent = await prepare("agent", agentSecret);

console.log(`\nGateway wallet (receives): ${gateway.address}   USDC ${gateway.usdc}`);
console.log(`Agent wallet   (pays):     ${agent.address}   USDC ${agent.usdc}`);
if (Number(agent.usdc) === 0) {
  console.log(`\nNext: give the agent test USDC. Open https://faucet.circle.com, choose Stellar Testnet,`);
  console.log(`and paste the agent address above. Then run: npm run pay`);
} else {
  console.log("\nReady. Start the gateway (npm start), then in another terminal: npm run pay");
}

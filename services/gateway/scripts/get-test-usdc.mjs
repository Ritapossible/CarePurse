// Gets testnet USDC for the agent wallet by swapping some of its free test XLM on the
// Stellar testnet exchange. An alternative to https://faucet.circle.com. Testnet only.
// Usage: npm run get-usdc [amount]      (default 5 USDC)
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, BASE_FEE, Networks } from "@stellar/stellar-sdk";
import { config } from "../src/config.mjs";

const amount = process.argv[2] ?? "5";
let agent;
try { agent = Keypair.fromSecret(config.agentSecret); }
catch { console.error("AGENT_SECRET_KEY missing or invalid. Run: npm run setup"); process.exit(1); }

const horizon = new Horizon.Server(config.horizonUrl);
const usdc = new Asset("USDC", config.usdc.issuer);

const paths = await horizon.strictReceivePaths([Asset.native()], usdc, amount).call();
const best = paths.records[0];
if (!best) { console.error("No XLM → USDC offer on the testnet exchange right now. Use https://faucet.circle.com instead."); process.exit(1); }
const maxXlm = (Number(best.source_amount) * 1.05).toFixed(7); // 5% slippage room
console.log(`Buying ${amount} USDC for at most ${maxXlm} test XLM…`);

const account = await horizon.loadAccount(agent.publicKey());
const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.pathPaymentStrictReceive({
    sendAsset: Asset.native(), sendMax: maxXlm,
    destination: agent.publicKey(), destAsset: usdc, destAmount: amount,
    path: best.path.map((p) => (p.asset_type === "native" ? Asset.native() : new Asset(p.asset_code, p.asset_issuer))),
  }))
  .setTimeout(60)
  .build();
tx.sign(agent);
const result = await horizon.submitTransaction(tx);

const after = await horizon.loadAccount(agent.publicKey());
const balance = after.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === config.usdc.issuer)?.balance;
console.log(`✓ Agent now holds ${balance} USDC · ${config.explorerUrl}/tx/${result.hash}`);

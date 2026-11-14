// The daughter funds the purse: the guardian wallet buys test USDC with test XLM on the Stellar
// testnet exchange, then deposits some of it into the purse contract (a plain USDC transfer).
// Testnet only. Usage: npm run fund-purse [buy_usdc] [deposit_usdc]     (defaults 100 and 50)
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { config } from "../src/config.mjs";
import { addressVal, createSoroban, i128 } from "../src/purse-contract.mjs";

const buy = process.argv[2] ?? "100";
const deposit = Number(process.argv[3] ?? 50);
if (!config.purseContractId) { console.error("No PURSE_CONTRACT_ID. Run: npm run deploy-purse"); process.exit(1); }
const secret = process.env.GUARDIAN_SECRET?.trim();
if (!secret) { console.error("GUARDIAN_SECRET missing in .env"); process.exit(1); }
const guardian = Keypair.fromSecret(secret);
const horizon = new Horizon.Server(config.horizonUrl);
const usdc = new Asset("USDC", config.usdc.issuer);
const link = (h) => `${config.explorerUrl}/tx/${h}`;
const usdcBalance = async () => Number((await horizon.loadAccount(guardian.publicKey())).balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === config.usdc.issuer)?.balance ?? 0);
const submit = async (op) => {
  const account = await horizon.loadAccount(guardian.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(op).setTimeout(60).build();
  tx.sign(guardian);
  return (await horizon.submitTransaction(tx)).hash;
};

// 1. USDC trustline (once)
const account = await horizon.loadAccount(guardian.publicKey());
if (!account.balances.some((b) => b.asset_code === "USDC" && b.asset_issuer === config.usdc.issuer)) {
  console.log(`✓ added a USDC trustline to the guardian wallet · ${link(await submit(Operation.changeTrust({ asset: usdc })))}`);
}

// 2. Buy USDC with test XLM
if (Number(buy) > 0) {
  const paths = await horizon.strictReceivePaths([Asset.native()], usdc, buy).call();
  const best = paths.records[0];
  if (!best) { console.error("No XLM → USDC offer on the testnet exchange right now. Try https://faucet.circle.com"); process.exit(1); }
  const sendMax = (Number(best.source_amount) * 1.05).toFixed(7);
  const hash = await submit(Operation.pathPaymentStrictReceive({
    sendAsset: Asset.native(), sendMax, destination: guardian.publicKey(), destAsset: usdc, destAmount: buy,
    path: best.path.map((p) => (p.asset_type === "native" ? Asset.native() : new Asset(p.asset_code, p.asset_issuer))),
  }));
  console.log(`✓ bought ${buy} USDC for about ${Number(best.source_amount).toFixed(2)} test XLM · ${link(hash)}`);
}

// 3. Deposit into the purse
if (deposit > 0) {
  const units = BigInt(Math.round(deposit * 10 ** config.usdc.decimals));
  const r = await createSoroban({ rpcUrl: config.rpcUrl }).invoke(guardian, config.usdc.contractId, "transfer",
    [addressVal(guardian.publicKey()), addressVal(config.purseContractId), i128(units)]);
  console.log(`✓ deposited ${deposit} USDC into the purse · ${link(r.hash)}`);
}

const purse = await createSoroban({ rpcUrl: config.rpcUrl }).read(config.usdc.contractId, "balance", [addressVal(config.purseContractId)], guardian.publicKey());
console.log(`\nPurse: ${(Number(purse) / 1e7).toFixed(2)} USDC · Guardian keeps: ${(await usdcBalance()).toFixed(2)} USDC`);

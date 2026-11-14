// The on-chain demo: an agent whose code is bypassed tries to take more than the guardian's
// per-top-up cap (default 7 USDC). Mhasibu's own rule checks are skipped on purpose.
// The purse contract refuses it on Stellar testnet.
//   npm run overspend [usdc]          (default 7)
import { config } from "../src/config.mjs";
import { ContractRefused, buyArgs, createSoroban, keypair } from "../src/purse-contract.mjs";
import { createPurseStore } from "../src/purses.mjs";

if (!config.purseContractId) { console.error("No PURSE_CONTRACT_ID. Run: npm run deploy-purse"); process.exit(1); }
const usdc = Number(process.argv[2] ?? 7);
const purse = createPurseStore(config.pursesFile).get("demo");
const soroban = createSoroban({ rpcUrl: config.rpcUrl });
const amount = BigInt(Math.round(usdc * 10 ** config.usdc.decimals));
console.log(`Agent asks the purse contract for ${usdc} USDC of electricity (skipping Mhasibu's own checks)…`);
try {
  const r = await soroban.invoke(keypair(config.agentSecret), config.purseContractId, "buy",
    buyArgs({ utility: "electricity", destination: purse.destinations.electricity, amount, orderId: `overspend-${Date.now()}` }));
  console.log(`✗ The contract allowed it: ${config.explorerUrl}/tx/${r.hash}`);
  process.exit(1);
} catch (e) {
  if (!(e instanceof ContractRefused)) throw e;
  console.log(`✓ Refused on-chain by the purse contract: ${e.rule} limit (Error #${e.code}). No USDC moved.`);
}

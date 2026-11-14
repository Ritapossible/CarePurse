// Brings the demo purse and the purse contract in line with DEMO_PURSE (src/purses.mjs):
// saved destinations, providers and caps. Spends and chat history are kept.
// The guardian signs the contract updates. Run after changing the demo purse.
//   npm run sync-purse
import { xdr } from "@stellar/stellar-sdk";
import { config } from "../src/config.mjs";
import { DEMO_PURSE, createPurseStore } from "../src/purses.mjs";
import { bytes32, capBaseUnits, createSoroban, i128, keypair, sha256, symbol } from "../src/purse-contract.mjs";

const MIN_TOPUP = { electricity: 500, airtime: 100, data: 100 };
const purses = createPurseStore(config.pursesFile);
purses.update("demo", (p) => {
  p.mama = { ...p.mama, ...DEMO_PURSE.mama };
  p.destinations = { ...DEMO_PURSE.destinations };
  p.providers = { ...DEMO_PURSE.providers };
});
const purse = purses.get("demo");
console.log(`✓ demo purse: meter ${purse.destinations.electricity} (${purse.providers.disco}), phone ${purse.destinations.airtime} (${purse.providers.network})`);

if (!config.purseContractId) { console.log("No PURSE_CONTRACT_ID: nothing to update on-chain."); process.exit(0); }
const guardianSecret = process.env.GUARDIAN_SECRET?.trim();
if (!guardianSecret) { console.error("GUARDIAN_SECRET missing in .env (npm run deploy-purse creates it)."); process.exit(1); }
const guardian = keypair(guardianSecret);
const soroban = createSoroban({ rpcUrl: config.rpcUrl });
const link = (h) => `${config.explorerUrl}/tx/${h}`;
const capsVal = (l, u) => xdr.ScVal.scvMap([
  ["per_day", l.perDay], ["per_month", l.perMonth], ["per_topup", l.perTopup], ["per_week", l.perWeek],
].map(([k, v]) => new xdr.ScMapEntry({ key: symbol(k), val: i128(capBaseUnits(v ?? 0, config.ngnPerUsdc, MIN_TOPUP[u])) })));
for (const [utility, limits] of Object.entries(purse.limits)) {
  const d = await soroban.invoke(guardian, config.purseContractId, "set_destination", [symbol(utility), bytes32(sha256(purse.destinations[utility]))]);
  const c = await soroban.invoke(guardian, config.purseContractId, "set_caps", [symbol(utility), capsVal(limits, utility)]);
  console.log(`✓ ${utility}: destination and caps saved on-chain · ${link(d.hash)} · ${link(c.hash)}`);
}

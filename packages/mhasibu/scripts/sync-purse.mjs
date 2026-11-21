// Brings the demo purse and the purse contract in line with DEMO_PURSE (src/purses.mjs):
// saved destinations, providers and caps. Spends and chat history are kept.
// The guardian signs the contract updates. Run after changing the demo purse.
//   npm run sync-purse
import { xdr } from "@stellar/stellar-sdk";
import { config } from "../src/config.mjs";
import { DEMO_PURSE, openPurseStore } from "../src/purses.mjs";
import { monthlyCap } from "../src/limits.mjs";
import { bytes32, capBaseUnits, capRate, createSoroban, destHash, i128, keypair, symbol } from "../src/purse-contract.mjs";

const MIN_TOPUP = { electricity: 500, airtime: 100, data: 100 };
const purses = await openPurseStore({ file: config.pursesFile, databaseUrl: config.databaseUrl });
purses.update("demo", (p) => {
  p.mama = { ...p.mama, ...DEMO_PURSE.mama };
  p.destinations = { ...DEMO_PURSE.destinations };
  p.providers = { ...DEMO_PURSE.providers };
});
const purse = purses.get("demo");
console.log(`✓ demo purse: meter ${purse.destinations.electricity} (${purse.providers.disco}), phone ${purse.destinations.airtime} (${purse.providers.network})`);

if (!config.purseContractId) { console.log("No PURSE_CONTRACT_ID: nothing to update on-chain."); await purses.close(); process.exit(0); }
const guardianSecret = process.env.GUARDIAN_SECRET?.trim();
if (!guardianSecret) { console.error("GUARDIAN_SECRET missing in .env (npm run deploy-purse creates it)."); process.exit(1); }
const guardian = keypair(guardianSecret);
const soroban = createSoroban({ rpcUrl: config.rpcUrl });
const link = (h) => `${config.explorerUrl}/tx/${h}`;
const capsVal = (l, u) => xdr.ScVal.scvMap([
  ["per_day", l.perDay], ["per_month", l.perMonth], ["per_topup", l.perTopup], ["per_week", l.perWeek],
].map(([k, v]) => new xdr.ScMapEntry({ key: symbol(k), val: i128(capBaseUnits(v ?? 0, capRate(config), MIN_TOPUP[u], config.usdc.decimals, config.serviceFeeBps)) })));
for (const [utility, limits] of Object.entries(purse.limits)) {
  const d = await soroban.invoke(guardian, config.purseContractId, "set_destination", [symbol(utility), bytes32(destHash(purse.destinations[utility], { key: config.destHashKey, contractId: config.purseContractId }))]);
  const c = await soroban.invoke(guardian, config.purseContractId, "set_caps", [symbol(utility), capsVal(limits, utility)]);
  console.log(`✓ ${utility}: destination and caps saved on-chain · ${link(d.hash)} · ${link(c.hash)}`);
}
// The whole-purse monthly cap (₦120,000 on Standard), always recomputed from the limits.
// 0 on-chain means NO total limit, so never write it: stop instead.
const purseCapNgn = monthlyCap(purse.limits);
if (!(purseCapNgn > 0)) { console.error("✗ The purse's monthly cap works out to 0 (no limits?). Not writing it: 0 means unlimited on-chain."); process.exit(1); }
purses.update("demo", (p) => { p.monthlyCap = purseCapNgn; });
const cap = await soroban.invoke(guardian, config.purseContractId, "set_purse_cap", [i128(capBaseUnits(purseCapNgn, capRate(config), 100, config.usdc.decimals, config.serviceFeeBps))]);
console.log(`✓ purse cap ₦${purseCapNgn.toLocaleString("en-NG")} a month saved on-chain · ${link(cap.hash)}`);
await purses.close();

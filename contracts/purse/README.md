# Purse contract (Soroban)

Holds Mama's USDC and enforces her daughter's rules **on-chain**. Mhasibu can't spend past them, even if its own code is wrong or hacked.

> Live Stellar Testnet payment · sandbox utility fulfilment

## How a top-up uses it

1. Mhasibu runs its own rules in code, gets the gateway's 402, and checks it.
2. Mhasibu calls `buy(utility, dest_hash, amount, order_ref)` on this contract.
3. The contract checks every rule below. If one fails, the whole call fails and no USDC moves.
4. If all pass, it sends **exactly** `amount` to the agent wallet and emits `Bought`.
5. Mhasibu pays the gateway with standard x402 straight away. The agent wallet never holds more than one top-up.

x402 stays standard: the facilitator still sees a plain USDC `transfer` signed by the agent.

## Functions

| Function | Who | What |
|---|---|---|
| `__constructor(guardian, agent, usdc)` | deployer | Sets the guardian (daughter), the agent (Mhasibu's wallet) and the USDC contract |
| `set_caps(utility, Caps)` | guardian | `per_topup`, `per_day`, `per_week`, `per_month` in USDC base units (0 = no limit for that period) |
| `set_purse_cap(per_month)` | guardian | Whole-purse limit per calendar month |
| `set_destination(utility, sha256(number))` | guardian | The saved meter or phone, stored as a hash so the ledger doesn't show where Mama lives |
| `set_agent`, `pause`, `unpause`, `withdraw` | guardian | |
| `buy(utility, dest_hash, amount, order_ref)` | agent | Checks the rules, records the spend, releases exactly `amount` |
| `refund(order_ref)` | agent | The x402 payment failed: returns that order's USDC from the agent to the purse and takes its spend off the caps (periods still current). Once per order, and **only the latest order** |
| `caps`, `spent`, `purse_cap`, `order`, `paused`, `guardian`, `agent` | anyone | Read-only |

Funding: anyone sends USDC to the contract address with a normal USDC transfer.

## Rules in `buy` (the first "no" wins)

| # | Error | Rule |
|---|---|---|
| 1 | `Paused` | The guardian paused the purse |
| 9 | `BadAmount` | Amount must be above 0 |
| 8 | `WrongDestination` | Only the meter or phone the guardian saved |
| 2 | `NoCaps` | A utility with no caps can't be bought (default deny) |
| 3 | `OverPerTopup` | Over the per-top-up cap |
| 11 | `OrderUsed` | Each order can be paid once |
| 4, 5, 6 | `OverDay`, `OverWeek`, `OverMonth` | Utility limits per day, week (from Monday) and calendar month, in Lagos time |
| 7 | `OverPurseMonth` | The whole-purse monthly cap |
| 10 | `LowBalance` | The purse holds less than the amount |
| 12, 13, 14 | `NoOrder`, `AlreadyRefunded`, `NotLatestOrder` | `refund` only: unknown order, already refunded, or a newer order exists |

Caps are set in naira on the dashboard and turned into USDC base units at the demo rate (`NGN_PER_USDC`). Rounding always favours the guardian's limit being reachable, never exceeded by more than one base unit per top-up.

## Build, test, deploy

```bash
cd contracts/purse
cargo test                      # 14 tests, no network
stellar contract build          # needs stellar-cli; writes target/wasm32v1-none/release/carepurse_purse.wasm

cd ../../packages/mhasibu
npm run deploy-purse            # testnet: deploy, set caps and destinations, move the agent's USDC in
npm run overspend               # the demo: ask for 7 USDC, skipping Mhasibu's code. Refused on-chain.
```

Built with `soroban-sdk` 29.0.1 and `stellar-cli` 30.0.1. Testnet runs protocol 30. On Linux, installing the CLI with `cargo install --locked stellar-cli` needs `libdbus-1-dev`, `libudev-dev` and `pkg-config`.

## Live on testnet (14 Nov 2026)

- Purse contract **v4**: [`CBWQ4EQSCNTDRQFJ6YLZT2GOUEHKA6N233IKZBGOVHKMZDQ5R2AG5OBV`](https://stellar.expert/explorer/testnet/contract/CBWQ4EQSCNTDRQFJ6YLZT2GOUEHKA6N233IKZBGOVHKMZDQ5R2AG5OBV), Standard preset, purse cap ₦120,000 a month (81.63 USDC, `purse_cap()`), 100 USDC in it.
- v4 adds: `refund` only on the **latest** order (an older order can't be refunded with a newer order's USDC, which would move spend between utilities), and order records kept alive about 30 days. Checked live: refunding an older order is refused (`NotLatestOrder`); the latest one works ([tx](https://stellar.expert/explorer/testnet/tx/e4885df95bf2292087ec1353a0cb42e989c28365af4a64e05207afd2d0a4aa13)); an order record shows 535,679 ledgers (about 31 days) to live.
- History: v1 `CDHX2A…MJAE` (no refund), v2 `CBKVT2…CDIP` (refund on any order), v3 `CBTGNM…MC57` (order lifetime not actually extended). All retired; their USDC went back to the guardian.
- The overspend demo: 7 USDC asked, refused on-chain with `OverPerTopup` (Error #3). No USDC moved.
- Funding: the guardian bought 1,000 test USDC on the testnet exchange (`npm run fund-purse`); the purse holds 100, the guardian keeps the rest for testing and Demo Day.
- Testnet resets on 16 Dec 2026: run `npm run deploy-purse` again after a reset.

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
| `set_agent` | guardian | Refused with `OrderOpen` (#15) while the latest order is neither committed nor refunded (v6, 21 Nov): only the agent holding the released USDC can settle it |
| `pause`, `unpause`, `withdraw` | guardian | |
| `buy(utility, dest_hash, amount, order_ref)` | agent | Checks the rules, records the spend, releases exactly `amount` |
| `refund(order_ref)` | agent | The x402 payment failed: returns that order's USDC from the agent to the purse and takes its spend off the caps (periods still current). Only the open (latest) order, never a committed one |
| `commit(order_ref)` | agent | The x402 payment succeeded: closes the open order as final, so the next `buy` can run |
| `guardian_close(order_ref)` | guardian | **Last resort only** (e.g. the agent's key is lost): closes a stuck open order as final. It does **not** return the USDC and the cap stays used, so never use it for an unpaid order while Mhasibu works: Mhasibu settles those itself |
| `upgrade(new_wasm_hash)` | guardian | Replace the code in place (same address, storage and USDC). See "Upgrading" below |
| `caps`, `spent`, `purse_cap`, `order`, `open_order`, `paused`, `guardian`, `agent` | anyone | Read-only |

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
| 15 | `OrderOpen` | The last order is neither committed nor refunded: one open order at a time |
| 12, 13, 14, 16 | `NoOrder`, `AlreadyRefunded`, `NotLatestOrder`, `AlreadyCommitted` | `refund` and `commit` only |

Caps are set in naira on the dashboard and turned into USDC base units at the demo rate (`NGN_PER_USDC`). Rounding always favours the guardian's limit being reachable, never exceeded by more than one base unit per top-up.

## Build, test, deploy

```bash
cd contracts/purse
cargo test                      # 17 tests, no network
stellar contract build          # needs stellar-cli; writes target/wasm32v1-none/release/carepurse_purse.wasm

cd ../../packages/mhasibu
npm run deploy-purse            # testnet: deploy, set caps and destinations, move the agent's USDC in
npm run overspend               # the demo: ask for 7 USDC, skipping Mhasibu's code. Refused on-chain.
```

Built with `soroban-sdk` 29.0.1 and `stellar-cli` 30.0.1. Testnet runs protocol 30. On Linux, installing the CLI with `cargo install --locked stellar-cli` needs `libdbus-1-dev`, `libudev-dev` and `pkg-config`.

## Live on testnet (14 Nov 2026)

- Purse contract **v6**: [`CCJMZQ47JXY3CT6OKWGD4AUQFSRDHRMPOBHOGCCXXVKVFG5RTLQ3B3XC`](https://stellar.expert/explorer/testnet/contract/CCJMZQ47JXY3CT6OKWGD4AUQFSRDHRMPOBHOGCCXXVKVFG5RTLQ3B3XC), Standard preset, purse cap ₦120,000 a month (81.63 USDC), about 100 USDC in it. **Upgradable in place** from now on (`npm run upgrade-purse`), so its address stays the same.
- v6 adds `upgrade` (guardian only). Checked live: upgraded in place, purse cap and funds unchanged; a release that Mhasibu wasn't sure of was refunded on the next message; an open order whose id was lost locally was found by its on-chain reference and refunded; a normal top-up went release → x402 → commit.
- v5 added one open order at a time (`commit`, `OrderOpen`, `guardian_close`, `open_order`).
- v4 added refund only on the latest order and ~30-day order records (still true in v5).
- History: v1 `CDHX2A…MJAE` (no refund), v2 `CBKVT2…CDIP` (refund on any order), v3 `CBTGNM…MC57` (order lifetime not actually extended), v4 `CBWQ4E…5OBV` (no open-order rule), v5 `CAMXGO…32FG` (not upgradable). All retired; their USDC went back to the guardian.
- The overspend demo: 7 USDC asked, refused on-chain with `OverPerTopup` (Error #3). No USDC moved.
- Funding: the guardian bought 1,000 test USDC on the testnet exchange (`npm run fund-purse`); the purse holds 100, the guardian keeps the rest for testing and Demo Day.
- Testnet resets on 16 Dec 2026: run `npm run deploy-purse` again after a reset.

## Upgrading (v6 and later)

```bash
cd contracts/purse && stellar contract build
cd ../../packages/mhasibu && npm run upgrade-purse     # guardian signs; same address, same funds
```

Rules for a new version, so existing data still reads:
- Don't rename, reorder or remove `Key` variants or `Error` codes; only add new ones at the end.
- Don't change the fields of `Caps`, `Spent` or `OrderRec`; add a new key for new data instead.
- Run `cargo test`, then upgrade on testnet and check `purse_cap()`, `open_order()` and a small top-up.


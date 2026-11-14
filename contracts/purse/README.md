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
| `caps`, `spent`, `paused`, `guardian`, `agent` | anyone | Read-only |

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

Caps are set in naira on the dashboard and turned into USDC base units at the demo rate (`NGN_PER_USDC`). Rounding always favours the guardian's limit being reachable, never exceeded by more than one base unit per top-up.

## Build, test, deploy

```bash
cd contracts/purse
cargo test                      # 10 tests, no network
stellar contract build          # needs stellar-cli; writes target/wasm32v1-none/release/carepurse_purse.wasm

cd ../../packages/mhasibu
npm run deploy-purse            # testnet: deploy, set caps and destinations, move the agent's USDC in
npm run overspend               # the demo: ask for 7 USDC, skipping Mhasibu's code. Refused on-chain.
```

Built with `soroban-sdk` 29.0.1 and `stellar-cli` 30.0.1. Testnet runs protocol 30. On Linux, installing the CLI with `cargo install --locked stellar-cli` needs `libdbus-1-dev`, `libudev-dev` and `pkg-config`.

## Live on testnet (14 Nov 2026)

- Purse contract: [`CDHX2A22XCJBWPL2524SZDKNCB66EKYFO736KWHOIISB4HAZNKLLMJAE`](https://stellar.expert/explorer/testnet/contract/CDHX2A22XCJBWPL2524SZDKNCB66EKYFO736KWHOIISB4HAZNKLLMJAE), Standard preset, 3.50 USDC in it.
- A ₦500 electricity top-up: the contract released 0.3401361 USDC, then x402 settled it.
- The overspend demo: 7 USDC asked, refused on-chain with `OverPerTopup` (Error #3). No USDC moved.
- Testnet resets on 16 Dec 2026: run `npm run deploy-purse` again after a reset.

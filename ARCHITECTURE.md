# CarePurse architecture

How the parts fit together. Keep it simple: three parts, one paid route, one payment flow for all three utilities.

## The parts

```
┌────────────────────────── apps/web (Next.js) ──────────────────────────┐
│  Mama's chat          Daughter's dashboard        Mhasibu (agent API)   │
│  phone + code login   Privy wallet login          LLM picks options,    │
│                       meter, phone, limits, fund  code checks + pays    │
└───────────────┬───────────────────────────────────────────┬────────────┘
                │ reads purse, records spend                │ x402 payment
                ▼                                           ▼
┌──────────────── contracts/purse ───────┐   ┌──────── services/gateway ───────────┐
│ Soroban (Rust). Holds the USDC,        │   │ Express + @x402/express (the seller) │
│ saved destinations, per-utility caps.  │   │ POST /v1/orders           (free)     │
│ Phase 2: enforces the limits on-chain. │   │ GET  /paid/topup/:utility/:tier (402)│
└────────────────────────────────────────┘   │ calls a sandbox utility provider     │
                                             └──────────────┬───────────────────────┘
                                                            │ verify + settle
                                                            ▼
                                     Facilitator (Coinbase or Built on Stellar) → Stellar testnet
```

| Part | Folder | Built with | Job |
|---|---|---|---|
| Web app | `apps/web` | Next.js, TypeScript, Tailwind | Mama's chat (`/chat`), the judges' demo view with the live **Agent & x402 Log** (`/demo`), later the daughter's dashboard |
| Mhasibu (agent) | `packages/mhasibu` (built) | Claude via `@anthropic-ai/sdk` (or a scripted parser), `@x402/fetch`, `@x402/stellar` | Turns Mama's message into an intent, checks every rule, asks the purse contract, pays the gateway. Runs as its own small API (`npm run serve`, port 4022) because it holds the agent wallet's key; it streams every step to the log panel over Server-Sent Events. |
| Gateway (seller) | `services/gateway` | Express, `@x402/express`, `@x402/core`, `@x402/stellar` | Prices each top-up, answers 402, returns the token after payment |
| Purse contract | `contracts/purse` (built) | Rust, `soroban-sdk` 29 | Holds the funds and the rules on-chain; `buy` releases exactly one top-up to the agent |

The gateway follows Koxy's workshop kit (`src/server.mjs`), and the agent's paying code follows the kit's `src/client.mjs` (see `library.md`, section 5).

## Accounts and wallets

| Who | How they sign in | Wallet |
|---|---|---|
| Mama | Phone number + one-time code (shown on screen in the demo) | None |
| Daughter | **Privy** (email or Google) | Privy embedded Stellar wallet. Signs funding and rule changes. |
| Mhasibu | Server only | **One agent wallet per purse**, held by the server. Phase 1: this wallet *is* the purse, so the daughter funds it directly and its balance is the hard limit (the kit's Layer 3). Phase 2: the contract holds the money and the agent wallet holds at most the purchase in progress. |
| Gateway | Server only | Receives payments (`GATEWAY_RECIPIENT`). Needs a USDC trustline. |

**Why one agent wallet per purse:** the workshop's third safety layer is "the wallet can never spend more than it holds". If every family shared one agent wallet, one family's money could pay for another family's top-up. For the hackathon demo there is one family, so one wallet.

**Privy check (do first):** Privy lists Stellar among its supported chains. Confirm whether it gives us a ready Stellar signing method or only raw signing (where we build the transaction with `@stellar/stellar-sdk` and ask Privy to sign the hash). If Privy blocks us, use Stellar Wallets Kit (Freighter) for the daughter instead.

## Flow 1: Setting up a purse

**The daughter sets everything up, and Mama does one step.** Full screen-by-screen plan: [SIGNUP.md](SIGNUP.md).

One path only. Mama can't start a purse; without a link she sees "Ask your child to set up CarePurse and send you the link."

1. **The daughter signs in with Privy** and becomes the purse's **guardian**.
2. **She enters Mama's details:** name, phone number and language.
3. **She enters Mama's meter number.** The gateway looks up the owner's name ("NGOZI OKAFOR, IKEDC prepaid") and she confirms. Airtime and data go to Mama's own phone number; there's no second number.
4. **She picks a preset, Light or Standard.** The purse monthly cap is calculated from it. Then she funds the purse with testnet USDC on the same screen.
5. **She invites Mama** with Copy link or Share on WhatsApp (a `wa.me` link, not a WhatsApp integration). Each link works once and expires after 7 days. She can send a new link if Mama didn't use it, which cancels the old one.
6. **Mama taps the link,** confirms the code sent to her number, and the chat opens with a welcome in her language. Her saved meter and phone are shown read-only.

**MVP limits:** one guardian per purse, and one purse per Mama.

### Invite links (stored in the database)

| Field | Notes |
|---|---|
| `token` | Random, single use. Stored hashed. |
| `purse_id`, `created_by` | Always the guardian (daughter) |
| `expires_at` | 7 days after creation |
| `used_at`, `cancelled_at` | Creating a new link sets `cancelled_at` on the old one |

The one-time code is only ever sent to the phone number already saved for Mama, so a forwarded link alone can't claim the purse.

## Flow 2: A top-up (the golden path)

Same flow for electricity, airtime and data.

```
Mama        Mhasibu (web/agent)          Gateway                    Facilitator / Stellar
 │ "Abeg, light don almost finish"
 │──────────►│
 │           │ works out the most Mama may spend now (limits + balance)
 │           │ GET /v1/options?utility=electricity&max_ngn=5000   (free)
 │           │──────────────────────────►│
 │           │◄── sizes up to max_ngn ───│
 │◄──────────│ "1) ₦2,000 ≈ 1.36 USDC  2) ₦5,000 ≈ 3.40 USDC  0) Cancel"
 │ "1"       │
 │──────────►│ checks rules again (see "Rule order")
 │           │ POST /v1/orders {utility, ngn, destination}   (free)
 │           │──────────────────────────►│ → order (id, amount)
 │           │ GET /paid/topup/electricity/2000?order=<id>
 │           │──────────────────────────►│
 │           │◄── 402 PAYMENT-REQUIRED ──│ (1.36 USDC, payTo, stellar:testnet)
 │           │ checks the 402 matches the quote (host, amount, payTo, asset, network)
 │           │ sign Soroban USDC auth, retry with PAYMENT-SIGNATURE
 │           │──────────────────────────►│── verify + settle ───────►│ USDC moves
 │           │◄── 200 PAYMENT-RESPONSE + token ──────────────────────│
 │◄──────────│ "Your token: 1234 5678 9012 3456 7890"
 │           │ records the spend, sends the daughter a receipt
```

### Why fixed price tiers

The kit's `@x402/express` setup gives each route a fixed price. To keep that simple, each top-up size is its own route with its own price. **Electricity starts at ₦500. Airtime and data start at ₦100.**

| Tier (naira) | Electricity | Airtime | Data | USDC (demo rate, set in `.env`) |
|---|---|---|---|---|
| ₦100 | | ✓ | ✓ | about 0.07 |
| ₦200 | | ✓ | ✓ | about 0.14 |
| ₦500 | ✓ | ✓ | ✓ | 0.34 |
| ₦1,000 | ✓ | ✓ | ✓ | 0.68 |
| ₦2,000 | ✓ | ✓ | ✓ | 1.36 |
| ₦5,000 | ✓ | ✓ | ✓ | 3.40 |
| ₦10,000 | ✓ | | | 6.80 |

Route pattern: `/paid/topup/:utility/:tier`, for example `/paid/topup/airtime/100` or `/paid/topup/electricity/5000`.

Small amounts are fine for x402: a ₦100 airtime top-up (about 0.07 USDC) settles exactly like a large one, because the Stellar fee is a tiny fraction of a cent. The gateway works out the exact price in USDC base units (7 decimals) from `NGN_PER_USDC`, so nothing is rounded away.

**The daughter's limits decide which tiers Mama sees.** The gateway doesn't know the limits. Mhasibu works out the most Mama may spend right now (every limit, plus the purse balance) and passes it as `max_ngn`. `GET /v1/options` then returns only the sizes up to that amount. Example: if she sets airtime to at most 0.34 USDC (₦500) per top-up, Mama is offered ₦100, ₦200 and ₦500 only. If she raises it, the bigger tiers appear. Nothing below the minimum (₦500 electricity, ₦100 airtime and data) is ever offered.

**Data bundles:** data is sold as fixed bundles by network, not by any amount. Each naira tier maps to the closest bundle the provider sells (for example ₦100 → the network's smallest daily bundle). The provider's sandbox catalogue gives the real bundle list.

The demo rate (`NGN_PER_USDC`) is a single number in `.env`. `@x402/express` 2.30 also accepts a price function per request, but we keep the fixed sizes: a fixed menu is easier for Mama, for the agent and for the judges to follow.

**Check with the provider:** some electricity distribution companies set their own minimum purchase, which can be above ₦500. If a meter's company refuses ₦500, the gateway hides that tier for that meter.

### What the gateway does on a paid request (as built in `services/gateway`)

The `@x402/express` middleware **verifies** the payment, runs our handler, and **settles** only after the handler answers 200. If the handler answers with an error, settlement is cancelled and nobody pays.

1. **Before any 402:** the order must exist, match the route's utility and size, still be `created`, and not be expired. Otherwise 4xx, and no payment is asked for.
2. **402:** the exact price, our `payTo`, the USDC contract, `stellar:testnet`.
3. **Verified retry:** the handler moves the order to `fulfilling` (only once, ever) and asks the provider for the token.
4. **Settlement:** the facilitator settles on Stellar, and the response carries `PAYMENT-RESPONSE`.
5. **Record:** the order becomes `delivered` with its transaction hash. A hash can settle one order only.
6. **Fail closed:** without a valid `GATEWAY_RECIPIENT`, paid routes answer 503 and never serve a token for free.

**Who checks the destination:** the gateway checks its format (meter or Nigerian phone). That it's a destination **the daughter saved** is checked by Mhasibu in Phase 1 and by the purse contract in Phase 2.

**Known gap for a live biller:** the token is issued in step 3, before settlement in step 4. With the sandbox, a failed settlement only wastes a demo token. A real biller needs "reserve, then confirm after settlement", or a refund path.

## Spending rules: where they live

| Phase | Where the rules are enforced | What stops overspending |
|---|---|---|
| **Phase 1 (Must have)** | Mhasibu's code, before it signs (like the kit's Layer 1), with limits stored in the database and set by the daughter | Code checks + the agent wallet's balance |
| **Phase 2 (Should have)** | **The purse contract on Soroban** | The Stellar network refuses anything over a limit |

**Rule order:** the first "no" wins, as in the kit. Mhasibu runs these before it signs anything.
1. **Allowlist:** is the 402 from our gateway's host, paying our `GATEWAY_RECIPIENT`, in testnet USDC, on `stellar:testnet`?
2. **Quoted price:** does the 402 amount equal the order's amount? If the price changed after the quote, nothing is signed (the kit's Layer 2).
3. **Destination:** is it the meter or phone the daughter saved for this utility?
4. **Per top-up:** within the per-top-up limit?
5. **Utility limits:** within the utility's day, week and month limits?
6. **Purse limit:** within the whole-purse month limit?
7. **Not paused:** is the purse unpaused?
8. **Mama said yes:** did Mama confirm this exact option in chat? No answer within the order's 10 minutes means no purchase, like the kit's "silence = decline".

The three layers from the workshop, mapped to CarePurse:

| Kit layer | CarePurse |
|---|---|
| 1. Spending rules in code | Rules 1 and 3 to 7 above (Phase 2: in the contract) |
| 2. Pay at most the quoted price | Rule 2 |
| 3. The wallet's own balance | One agent wallet per purse (Phase 1), or the contract's balance (Phase 2) |
| Human approval | Mama confirms every purchase (rule 8) |

### Phase 2: purse contract (Soroban), built 14 Nov in `contracts/purse`

Pulled into the Must have after the mentor's feedback: judges should see one cap enforced on-chain. As built (see `contracts/purse/README.md`): one saved destination per utility, caps per top-up, day, week and month, a purse monthly cap, pause, and one-time order references. The design below is the original sketch.


```
init(guardian, agent, gateway, usdc)
deposit(from, amount)                              anyone
set_destination(utility, dest_hash)                guardian only
remove_destination(utility, dest_hash)             guardian only
set_caps(utility, per_topup, per_day, per_week, per_month)   guardian only
set_purse_cap(per_month)                           guardian only
set_agent(new_agent) / pause() / unpause()         guardian only
withdraw(to, amount)                               guardian only
buy(utility, dest_hash, amount, order_ref)         agent only
   → checks every rule, records the spend,
     sends exactly `amount` to the agent wallet,
     emits Bought(utility, dest_hash, amount, order_ref)
```

- Mhasibu calls `buy` first, then pays the gateway with normal x402 straight away. The agent wallet never holds more than one purchase.
- **One open order at a time** (contract v5): Mhasibu writes the order down (flushed to the database) before `buy`, calls `commit` after the x402 payment succeeds, or `refund` if it fails. `buy` refuses while the last order is neither, so a crash or a second tap can't strand a release. On the next message an open order is settled first: committed if it was paid; otherwise the gateway's order record decides (delivered → keep the token and commit; failed or expired → refund). No new purchase starts until it's settled. The guardian can close a stuck order on-chain (`guardian_close`). Mama's balance includes USDC still on the agent wallet, and unconfirmed top-ups are labelled "not confirmed yet" in her history.
- **If the payment fails after `buy`** (built 14 Nov): Mhasibu calls `refund(order_ref)`, retried up to 3 times. The contract takes back exactly that order's USDC and its spend. **Only the latest order can be refunded**, so an agent can't pay for one order and refund it with a later order's USDC (that would move spend from one utility's cap to another's). If the refund still fails, Mhasibu records the spend as *unconfirmed* (the chain still counts it, so the code's caps must too), tells Mama it can't confirm yet, asks Adaeze to check, and retries the refund on Mama's next message. Mama's balance stays the purse contract's balance: USDC stuck on the agent can't be spent by `buy`, so it isn't offered.
- **Mama's token never disappears** (built 14 Nov): the token is kept on the gateway's order (`GET /v1/orders/:id`) and on Mhasibu's purchase record; it's in Adaeze's receipt; Mama can ask again in any words ("send my token again", "I no see the token") or pick 5 on the menu; and her chat pins the latest token at the top (`GET /v1/tokens`). **Production:** also send it by SMS to Mama's phone through an SMS provider (VTpass leaves this to the seller), and keep orders and purses in a database, not files (Render's free plan wipes files on restart).
- **Order records** live in persistent storage and are extended to about 30 days on every write, so `refund` and the one-time-order check keep working.
- **The purse monthly cap** is always recomputed from the limits before it's written (`deploy-purse`, `sync-purse`); 0 means "no cap" on-chain, so 0 is never written.
- The gateway can also check that a `Bought` event exists for the order.
- Meter and phone numbers are stored as **hashes**, so the public ledger doesn't show where Mama lives.
- The workshop also suggests **token allowances** (SEP-41 `approve` with a cap and an expiry) or **OpenZeppelin smart accounts**. Look at those before writing the contract; one may be simpler. See `library.md`.
  - **Allowance trade-off:** an allowance gives one total cap and an expiry, enforced by the USDC contract itself. It can't tell electricity from airtime, so per-utility caps would stay in Mhasibu's code. That's the simpler fallback if the purse contract runs late.
  - **x402 stays standard either way:** the facilitator expects the payer to sign a plain USDC `transfer`. So the contract (or an allowance `transfer_from`) moves the money to the agent wallet first, and the agent pays the gateway with normal x402.

## Mhasibu (the agent)

- **The LLM's job:** classifying Mama's message into `intent` (buy, choose, cancel, check_balance, history, change_rules, help, unknown), `utility` and `choice`, with a fixed schema (Claude Opus 5.5 through OpenServ's Anthropic-compatible endpoint, effort low; `LLM_BASE_URL` empty means Anthropic directly). Without a key, or if Claude fails, a scripted English/Pidgin parser does it.
- **The code's job:** every amount, every rule check, every payment.
- **Not told its limits:** the prompt only says a purchase may be refused.
- **Fixed replies:** the model never writes reply text. Every reply is a template in English or Pidgin, filled in by code, so it can't invent an amount. This replaces the earlier "discard replies with model-typed numbers" idea, and is stronger.
- **Foreign numbers:** any 10 to 13 digit number in Mama's message that isn't a saved destination makes the message a change request for the guardian, whatever the model understood.
- **Untrusted input:** Mama's messages and gateway replies are data, never instructions.
- **Fallback:** a scripted planner (no LLM) for when the AI is down, as in the kit.
- **Step cap:** at most 8 model steps per message (the kit's `AGENT_MAX_STEPS`), so a confused model can't loop.

## Data we store (web app database)

| Table | Fields |
|---|---|
| `users` | id, role (mama / guardian), phone (Mama), privy_user_id + stellar_address (guardian), language |
| `purses` | id, mama_id, guardian_id, contract_id (Phase 2), paused |
| `destinations` | purse_id, utility, number, owner_name, approved_by_guardian |
| `limits` | purse_id, utility, per_topup, per_day, per_week, per_month; plus purse per_month |
| `orders` | id, purse_id, gateway_order_id, utility, destination_id, ngn, amount (USDC base units), status, tx_hash (unique), token |
| `messages` | purse_id, from (mama / mhasibu), text, created_at |

**Order status** (same as the gateway): `created` → `fulfilling` → `delivered`, or `failed`. A failed order was never charged, because settlement is cancelled when fulfilment fails.

## Environment variables (`.env`, never commit)

The full list, with comments, is in [`.env.example`](.env.example). `cd services/gateway && npm run setup` creates `.env` from it and fills in the wallets. The main ones:

| Setting | What it is |
|---|---|
| `STELLAR_NETWORK` | Always `stellar:testnet`. The gateway refuses anything else. |
| `USDC_CONTRACT_ID`, `USDC_ISSUER`, `USDC_DECIMALS` | Circle testnet USDC; 7 decimals |
| `FACILITATOR` | `backup` = Coinbase (no key), `primary` = Built on Stellar (needs `FACILITATOR_PRIMARY_API_KEY`) |
| `GATEWAY_RECIPIENT` / `GATEWAY_RECIPIENT_SECRET` | The gateway wallet that receives payments |
| `AGENT_SECRET_KEY` | Mhasibu's wallet. Never share or show on screen. |
| `NGN_PER_USDC` | The demo rate used to price each size |
| `UTILITY_PROVIDER` | `mock` (built-in sandbox tokens) for now |
| `DATABASE_URL` | Postgres for orders, purses, purchases, tokens and chat (built 14 Nov). Empty = JSON files in `.data/`. Hosted on Neon (free, doesn't expire) |
| `LLM_*` | Claude via OpenServ for Mhasibu |
| `PRIVY_*` | For the daughter's dashboard, later |

### Storage (built 14 Nov)

One Postgres table, `carepurse_records (kind, id, doc jsonb)`: `order` and `tx` from the gateway, `purse` from Mhasibu (with its purchases, tokens, notifications and chat). Each service keeps its records in memory as before (the payment logic and its conditional status changes are unchanged), loads them at start, writes every change in order, and waits for the write before answering: Mhasibu before replying to Mama, the gateway before returning a token. A database error is logged and never blocks a token the provider already issued. One instance per service.

## Security checklist

- [x] `.env` is in `.gitignore` and never shown on screen
- [ ] Testnet only, labelled in the UI: "Live Stellar Testnet payment · sandbox utility fulfilment"
- [ ] Only the guardian's signature changes destinations or limits
- [x] The gateway fails closed and accepts one payment per order (built and tested)
- [ ] Mhasibu is never told its limits, and model-typed numbers are discarded
- [ ] The agent wallet holds only small amounts (one wallet per purse)
- [ ] Mhasibu checks every 402 against the quote (host, amount, payTo, asset, network) before signing

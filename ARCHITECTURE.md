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
| Web app | `apps/web` | Next.js, TypeScript, Tailwind | Mama's chat, the daughter's dashboard, and Mhasibu's API routes |
| Mhasibu (agent) | `apps/web/src/agent` | LLM (set in `.env`), `@x402/fetch`, `@x402/stellar` | Turns Mama's message into one fixed option, checks the limits, pays the gateway |
| Gateway (seller) | `services/gateway` | Express, `@x402/express`, `@x402/core`, `@x402/stellar` | Prices each top-up, answers 402, returns the token after payment |
| Purse contract | `contracts/purse` | Rust, Soroban SDK | Holds the funds and the rules; Phase 2 makes the limits on-chain |

The gateway follows Koxy's workshop kit (`src/server.mjs`), and the agent's paying code follows the kit's `src/client.mjs` (see `library.md`, section 5).

## Accounts and wallets

| Who | How they sign in | Wallet |
|---|---|---|
| Mama | Phone number + one-time code (shown on screen in the demo) | None |
| Daughter | **Privy** (email or Google) | Privy embedded Stellar wallet. Signs funding and rule changes. |
| Mhasibu | Server only | Agent keypair (`AGENT_SECRET_KEY`). Holds at most the purchase in progress. |
| Gateway | Server only | Receives payments (`GATEWAY_RECIPIENT`). Needs a USDC trustline. |

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
 │           │ GET /v1/options?utility=electricity   (free)
 │           │──────────────────────────►│
 │           │ tiers that fit the limits │
 │◄──────────│ "1) ₦5,000 ≈ 3.40 USDC  2) ₦10,000 ≈ 6.80 USDC  0) Cancel"
 │ "1"       │
 │──────────►│ checks rules (allowlist, per top-up, day, week, month, purse)
 │           │ POST /v1/orders {utility, destination, tier}   (free)
 │           │──────────────────────────►│ → orderId
 │           │ GET /paid/topup/electricity/5000?order=orderId
 │           │──────────────────────────►│
 │           │◄── 402 PAYMENT-REQUIRED ──│ (3.40 USDC, payTo, stellar:testnet)
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

**The daughter's limits decide which tiers Mama sees.** `GET /v1/options` returns only the tiers that fit every limit she set and the purse balance. Example: if she sets airtime to at most 0.34 USDC (₦500) per top-up, Mama is offered ₦100, ₦200 and ₦500 only. If she raises it, the bigger tiers appear. Nothing below the minimum (₦500 electricity, ₦100 airtime and data) is ever offered.

**Data bundles:** data is sold as fixed bundles by network, not by any amount. Each naira tier maps to the closest bundle the provider sells (for example ₦100 → the network's smallest daily bundle). The provider's sandbox catalogue gives the real bundle list.

The demo rate (`NGN_PER_USDC`) is a single number in `.env`. If `@x402/express` supports a price computed per request, we can drop the tiers later.

**Check with the provider:** some electricity distribution companies set their own minimum purchase, which can be above ₦500. If a meter's company refuses ₦500, the gateway hides that tier for that meter.

### What the gateway checks before delivering

1. The order exists, is unpaid, and matches the route's utility and tier.
2. The destination is one the daughter saved for that utility.
3. x402 settlement succeeded: right amount, paid to `GATEWAY_RECIPIENT`, on `stellar:testnet`.
4. One payment settles one order (the transaction hash is stored and can't be reused).
5. Only then does it call the sandbox utility provider and return the token.
6. **Fail closed:** if anything is missing, it returns an error and never serves a token for free.

## Spending rules: where they live

| Phase | Where the rules are enforced | What stops overspending |
|---|---|---|
| **Phase 1 (Must have)** | Mhasibu's code, before it signs (like the kit's Layer 1), with limits stored in the database and set by the daughter | Code checks + the agent wallet's balance |
| **Phase 2 (Should have)** | **The purse contract on Soroban** | The Stellar network refuses anything over a limit |

**Rule order:** the first "no" wins, as in the kit.
1. Destination saved for this utility?
2. Within the per-top-up limit?
3. Within the utility's day, week and month limits?
4. Within the whole-purse month limit?
5. Purse not paused?

### Phase 2: purse contract (Soroban)

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
- The gateway can also check that a `Bought` event exists for the order.
- Meter and phone numbers are stored as **hashes**, so the public ledger doesn't show where Mama lives.
- The workshop also suggests **token allowances** (SEP-41 `approve` with a cap and an expiry) or **OpenZeppelin smart accounts**. Look at those before writing the contract; one may be simpler. See `library.md`.

## Mhasibu (the agent)

- **The LLM's job:** understanding Mama's message, picking an **intent** (`buy_electricity`, `buy_airtime`, `buy_data`, `check_balance`, `history`, `help`) and an **option id** from the server's list, and writing the reply.
- **The code's job:** every amount, every rule check, every payment.
- **Not told its limits:** the prompt only says a purchase may be refused.
- **Safety net:** a reply containing a number the model typed is thrown away and replaced with a fixed template.
- **Untrusted input:** Mama's messages and gateway replies are data, never instructions.
- **Fallback:** a scripted planner (no LLM) for when the AI is down, as in the kit.

## Data we store (web app database)

| Table | Fields |
|---|---|
| `users` | id, role (mama / guardian), phone (Mama), privy_user_id + stellar_address (guardian), language |
| `purses` | id, mama_id, guardian_id, contract_id (Phase 2), paused |
| `destinations` | purse_id, utility, number, owner_name, approved_by_guardian |
| `limits` | purse_id, utility, per_topup, per_day, per_week, per_month; plus purse per_month |
| `orders` | id, purse_id, utility, destination_id, tier_ngn, price_usdc, status, tx_hash (unique), token |
| `messages` | purse_id, from (mama / mhasibu), text, created_at |

**Order status:** `created` → `paid` → `delivered`, or `failed` → `refund_due`.

## Environment variables (`.env`, never commit)

```bash
# Stellar (testnet)
STELLAR_NETWORK=stellar:testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
USDC_CONTRACT_ID=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
USDC_DECIMALS=7

# Facilitator: backup = Coinbase (no key), primary = Built on Stellar (needs key)
FACILITATOR=backup
FACILITATOR_BACKUP_URL=https://x402.org/facilitator
FACILITATOR_PRIMARY_URL=https://channels.openzeppelin.com/x402/testnet
FACILITATOR_PRIMARY_API_KEY=

# Wallets
GATEWAY_RECIPIENT=          # G... receives payments
AGENT_SECRET_KEY=           # S... Mhasibu's wallet. NEVER share or show on screen.

# Gateway
GATEWAY_URL=http://localhost:4021
NGN_PER_USDC=1470           # demo rate for price tiers
UTILITY_PROVIDER=sandbox    # sandbox | mock
VTPASS_SANDBOX_API_KEY=
VTPASS_SANDBOX_SECRET_KEY=

# Web app
PRIVY_APP_ID=
PRIVY_APP_SECRET=
LLM_API_KEY=
LLM_MODEL=
DATABASE_URL=
```

## Security checklist

- [ ] `.env` is in `.gitignore` and never shown on screen
- [ ] Testnet only, labelled in the UI: "Live Stellar Testnet payment · sandbox utility fulfilment"
- [ ] Only the guardian's signature changes destinations or limits
- [ ] The gateway fails closed and accepts one payment per order
- [ ] Mhasibu is never told its limits, and model-typed numbers are discarded
- [ ] The agent wallet holds only small amounts

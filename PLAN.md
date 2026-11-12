# CarePurse build plan

**Deadline: submissions close 28 November 2026.** Plan to finish on the 26th and keep the last two days for the demo video and submission.

## What we're building (MoSCoW)

| Priority | Scope |
|---|---|
| **Must have** | The x402 payment flow on Stellar testnet: Mhasibu asks, the gateway answers 402, Mhasibu signs and pays, the gateway returns the token. Electricity, airtime and data all use this one flow, with sandbox fulfilment. |
| **Should have** | Spend limits on-chain in a Soroban contract (per-utility caps, saved meter and phone), a transaction receipt log, and the daughter's funding and limits dashboard. |
| **Could have** | Price comparison across bills providers, scheduled weekly top-ups, several relatives funding one purse, Yoruba, Igbo and Hausa. |
| **Won't have** | Live tokens from a real biller, cash-out to naira, fiat bank KYC, mobile apps, WhatsApp. |

**Cut from the bottom** if we run late. Never cut the Must have.

## Who does what

Fill in the names. Agree on the API between the parts (`ARCHITECTURE.md`) early, so we can work in parallel.

| Part | Owner |
|---|---|
| Gateway (`services/gateway`) + x402 seller | ______ |
| Mhasibu agent + Mama's chat (`apps/web`) | ______ |
| Daughter's dashboard + Privy (`apps/web`) | ______ |
| Purse contract (`contracts/purse`, Rust) | ______ |
| Demo video, pitch deck, submission | Both |

## Step by step

### Step 0: Set up (day 1, 12–13 Nov)
- [ ] Both: run Koxy's workshop kit end to end (`library.md`, section 5). Get one paid request working on testnet. This proves our machines, wallets and facilitator work.
- [ ] Create the folders: `apps/web`, `services/gateway`, `contracts/purse`.
- [ ] Add `.gitignore` (with `.env`) and `.env.example` from `ARCHITECTURE.md`.
- [ ] Create the testnet wallets (gateway recipient and agent) and fund the agent from faucet.circle.com.
- [ ] Sign up for the VTpass sandbox and note the test meter and phone numbers.
- [ ] **Check Privy's Stellar support** (see `ARCHITECTURE.md`, Accounts and wallets). Decide Privy or Stellar Wallets Kit.

### Step 1: The paid gateway (14–16 Nov), Must have
- [ ] Copy the kit's `server.mjs` pattern into `services/gateway`.
- [ ] `GET /v1/options?utility=` returns the price tiers (free).
- [ ] `POST /v1/orders` creates an order (free).
- [ ] `GET /paid/topup/:utility/:tier` priced with x402. It answers 402 until paid.
- [ ] After payment: check the order, call the sandbox provider, return the token.
- [ ] One payment per order; fail closed.
- [ ] **Test:** `curl` the paid route and see the 402. Pay it with the kit's `client.mjs` pattern and get a token back.

### Step 2: Mhasibu pays (16–18 Nov), Must have
- [ ] An agent module with `@x402/fetch` + `@x402/stellar` (the kit's `client.mjs` pattern).
- [ ] Rule checks in code before signing (Phase 1 limits, from the database).
- [ ] The LLM turns Mama's message into an intent and an option id; the code does everything else.
- [ ] A scripted fallback with no LLM.
- [ ] **Test:** "Abeg, light don almost finish" → options → "1" → paid on testnet → token.

### Step 3: Mama's chat (18–20 Nov), Must have
- [ ] Phone + code login (code shown on screen).
- [ ] Chat screen: messages, numbered options, the token shown clearly, and a link to the transaction.
- [ ] English and Pidgin replies.
- [ ] Footer label: "Live Stellar Testnet payment · sandbox utility fulfilment".

### Step 4: Daughter's dashboard (19–22 Nov), Should have
- [ ] Privy login.
- [ ] Invite link from Mama → daughter becomes guardian.
- [ ] Add Mama's meter (with the owner name check) and phone number.
- [ ] Set limits per utility, plus the purse monthly cap.
- [ ] Fund the purse with USDC.
- [ ] Receipts: every top-up with its Stellar transaction link.

### Step 5: Limits on-chain (20–24 Nov), Should have
- [ ] Decide: our own purse contract, or token allowances / OpenZeppelin smart accounts (`library.md`).
- [ ] Write the contract and its tests (`ARCHITECTURE.md`, Phase 2).
- [ ] Mhasibu calls `buy` before paying.
- [ ] **Demo moment:** ask Mhasibu to pay a number the daughter didn't save. The contract refuses, live.

### Step 6: Polish and record (24–27 Nov)
- [ ] Run the golden path five times in a row without failure.
- [ ] Record the demo video (live or recorded x402 flow).
- [ ] Update the pitch deck from the Ideation & MVP slides.
- [ ] README with setup steps, architecture and the GitHub link.

### Step 7: Submit (27–28 Nov)
- [ ] Submission checklist: working prototype, live or recorded x402 flow, architecture docs, GitHub repo.
- [ ] Final check: no `.env` or secrets in the repo.

## Demo script (3 minutes)

1. **The problem (20 s):** Adaeze in London, Mama Ngozi in Lagos, the light running out.
2. **Set up (30 s):** Adaeze's dashboard: Mama's meter saved, limits set, purse funded.
3. **The golden path (60 s):** Mama: "Abeg, light don almost finish" → options → "1" → **402** → Mhasibu pays → token in chat. Show the transaction on the Stellar testnet explorer.
4. **The rules hold (40 s):** ask Mhasibu to top up a stranger's number → refused. Ask past the airtime limit → refused, and Adaeze is notified.
5. **Why x402 (30 s):** remove the payment and Mama gets nothing. One payment per top-up, no sign-up, no card.

## Definition of done for the Must have

- [ ] One electricity top-up works end to end on Stellar testnet, from Mama's chat message to the token.
- [ ] Airtime and data work through the same flow.
- [ ] Every payment has a transaction link anyone can open.
- [ ] No step is simulated except the utility provider (sandbox), and the UI says so.

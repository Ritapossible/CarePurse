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
- [ ] Create the folders: `apps/web`, `services/gateway` (done), `contracts/purse`.
- [x] Add `.gitignore` (with `.env`) and `.env.example`.
- [x] Create the testnet wallets and fund the agent: `npm run setup` then `npm run get-usdc` in `services/gateway`.
- [ ] Sign up for the VTpass sandbox and note the test meter and phone numbers.
- [ ] **Check Privy's Stellar support** (see `ARCHITECTURE.md`, Accounts and wallets). Decide Privy or Stellar Wallets Kit.

### Step 1: The paid gateway (14–16 Nov), Must have · **done 13 Nov**
- [x] Gateway in `services/gateway`, following the kit's `server.mjs` pattern.
- [x] `GET /v1/options?utility=&max_ngn=` returns the sizes (from ₦500 for electricity, from ₦100 for airtime and data) up to `max_ngn` (free). Mhasibu works out `max_ngn` from the limits and balance.
- [x] `POST /v1/orders` creates an order (free).
- [x] `GET /paid/topup/:utility/:tier` priced with x402. It answers 402 until paid.
- [x] After payment: check the order, call the sandbox provider (mock for now), return the token. VTpass sandbox is still to do.
- [x] One payment per order; fail closed.
- [x] **Test:** `npm run peek` shows the 402; `npm run pay` paid ₦500 electricity and ₦100 airtime on Stellar testnet in about 3 s each. Offline tests: `npm test`.

### Step 2: Mhasibu pays (16–18 Nov), Must have
- [ ] An agent module with `@x402/fetch` + `@x402/stellar` (the kit's `client.mjs` pattern; `services/gateway/scripts/pay.mjs` already does this).
- [ ] Rule checks in code before signing, in the order in `ARCHITECTURE.md`: allowlist, quoted price, destination, limits, paused, Mama's confirmation.
- [ ] One agent wallet per purse; the daughter funds it directly in Phase 1.
- [ ] Until the dashboard exists, seed the Standard limits and Mama's meter and phone in the database.
- [ ] The LLM turns Mama's message into an intent and an option id; the code does everything else.
- [ ] A scripted fallback with no LLM, and a cap of 8 model steps per message.
- [ ] **Test:** "Abeg, light don almost finish" → options → "1" → paid on testnet → token.

### Step 3: Mama's chat (18–20 Nov), Must have
- [ ] First screen: "Set up CarePurse for your mum", plus an "I'm Mama" message: "Ask your child to set up CarePurse and send you the link." (`SIGNUP.md`)
- [ ] Mama joins from the invite link: phone pre-filled, code shown on screen, chat opens with a welcome.
- [ ] "Add to home screen" prompt, shown once.
- [ ] Chat screen: messages, numbered options, the token shown clearly, and a link to the transaction.
- [ ] English and Pidgin replies.
- [ ] Footer label: "Live Stellar Testnet payment · sandbox utility fulfilment".

### Step 4: Daughter's dashboard (19–22 Nov), Should have
- [ ] The four sign-up screens from `SIGNUP.md` (D1 to D4).
- [ ] D1 Privy login; the daughter becomes guardian.
- [ ] D2 Mama: name, phone, language.
- [ ] D3 Mama's meter with the owner-name check. Airtime and data use Mama's phone.
- [ ] D4 Light / Standard presets (calculate the monthly cap), then fund: address, QR, Get test USDC.
- [ ] D5 Invite Mama: Copy link and Share on WhatsApp (`wa.me`). One use, 7-day expiry.
- [ ] Invite status on the dashboard, and **[Send a new invite]** that cancels the old link.
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
- [ ] Deploy for the judges (Render, as in the kit): gateway + web app. Use a small testnet balance, label it testnet, and move orders from the JSON file to a database (Render's disk is wiped on restart).

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

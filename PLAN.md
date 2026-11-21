# CarePurse build plan

**Deadline: submissions close 28 November 2026.** Plan to finish on the 26th and keep the last two days for the demo video and submission.

## What we're building (MoSCoW)

| Priority | Scope |
|---|---|
| **Must have** | The x402 payment flow on Stellar testnet: Mhasibu asks, the gateway answers 402, Mhasibu signs and pays, the gateway returns the token. Electricity, airtime and data all use this one flow, with sandbox fulfilment. **At least one live Soroban spend-cap check** (a top-up over the cap is refused on-chain), and a live **Agent & x402 Log** panel beside Mama's chat (mentor feedback, 13 Nov). |
| **Should have** | The rest of the on-chain rules (all caps, saved meter and phone), a transaction receipt log, and the daughter's funding and limits dashboard. |
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

### Step 0: Set up (day 1, 12-13 Nov)
- [x] Both: run Koxy's workshop kit end to end (`library.md`, section 5). Get one paid request working on testnet. This proves our machines, wallets and facilitator work.
- [x] Create the folders: `apps/web`, `services/gateway`, `contracts/purse`.
- [x] Add `.gitignore` (with `.env`) and `.env.example`.
- [x] Create the testnet wallets and fund the agent: `npm run setup` then `npm run get-usdc` in `services/gateway`.
- [x] Sign up for the VTpass sandbox and note the test meter and phone numbers (meter `1111111111111`, phone `08011111111`).
- [x] **Check Privy's Stellar support** (16 Nov): `@privy-io/react-auth` 3.51 supports `stellar` wallets (`useCreateWallet`, `useSignRawHash`, Ed25519). We use Privy.

### Step 1: The paid gateway (14-16 Nov), Must have · **done 13 Nov**
- [x] Gateway in `services/gateway`, following the kit's `server.mjs` pattern.
- [x] `GET /v1/options?utility=&max_ngn=` returns the sizes (from ₦500 for electricity, from ₦100 for airtime and data) up to `max_ngn` (free). Mhasibu works out `max_ngn` from the limits and balance.
- [x] `POST /v1/orders` creates an order (free).
- [x] `GET /paid/topup/:utility/:tier` priced with x402. It answers 402 until paid.
- [x] After payment: check the order, call the sandbox provider (mock for now), return the token. VTpass sandbox is still to do.
- [x] One payment per order; fail closed.
- [x] **Test:** `npm run peek` shows the 402; `npm run pay` paid ₦500 electricity and ₦100 airtime on Stellar testnet in about 3 s each. Offline tests: `npm test`.

### Step 2: Mhasibu pays (16-18 Nov), Must have · **done 13 Nov** (`packages/mhasibu`)
- [x] An agent module with `@x402/fetch` + `@x402/stellar`, with an exact-match `policies` filter before signing.
- [x] Rule checks in code before signing: allowlist, quoted price, destination, paused, limits, Mama's confirmation.
- [x] One agent wallet per purse; its balance is the hard limit in Phase 1.
- [x] Demo purse seeded (Standard limits, Mama's meter and phone) in `.data/purses.json`.
- [x] Claude (or the scripted parser) turns Mama's message into an intent; the code does everything else. Replies are fixed templates in English and Pidgin.
- [x] A scripted fallback with no LLM; one model call per message.
- [x] **Test:** "Abeg, light don almost finish" → options → "1" → paid on Stellar testnet → token, live via `npm run chat`. 12 offline tests (`npm test`).
- [x] Claude live through OpenServ (`LLM_BASE_URL`, model `claude-opus-5.5`): about 2 s per message, Pidgin understood, injection attempt classed as unknown. Tested 13 Nov.
- [x] Switched to a private model for privacy: `deepseek-ai/DeepSeek-V4.1-Flash-1017` on NEAR AI Cloud (verifiable, runs in a TEE), `LLM_API=openai`. 13 of 13 live Mama messages answered by the model itself (Pidgin, typos, rule changes, injection), about 2 s each. Corrected 16 Nov: the first pick, `deepseek/deepseek-v4.1-flash`, is not private. Claude stays an option. Tested 16 Nov.
- [ ] Have a native speaker check the Pidgin replies in `src/replies.mjs` (on the roadmap, below).

### Step 3: Mama's chat (18-20 Nov), Must have
- [x] First screen: "Set up CarePurse for your mum", plus an "I'm Mama" message: "Ask your child to set up CarePurse and send you the link." (`SIGNUP.md`)
- [x] Mama joins from the invite link: phone pre-filled, code shown on screen, chat opens with a welcome. 16 Nov (`/i/[token]`; httpOnly session cookie, her chat only reaches her purse).
- [x] "Add to home screen" prompt, shown once. 20 Nov.
- [x] Chat screen: messages, numbered options, the token shown clearly, and a link to the transaction (`apps/web`, `/chat`). 14 Nov.
- [x] The token never disappears: pinned "Last light token" card, "send my token again" in any words, menu 5, kept on the order and purchase record, in Adaeze's receipt. 14 Nov.
- [ ] SMS the token to Mama's phone (production; needs an SMS provider; on the roadmap, below).
- [x] English and Pidgin replies (language read from her messages, 20 Nov).
- [x] Footer label: "Live Stellar Testnet payment · sandbox utility fulfilment".
- [x] **Agent & x402 Log** panel beside the chat (`/demo`), 14 Nov: each step live, from Mama's message, the contract check and the 402 challenge to the signed payment and the Stellar Testnet settlement link. Mama's own chat stays simple.

### Step 4: Daughter's dashboard (19-22 Nov), Should have
- [x] The four sign-up screens from `SIGNUP.md` (D1 to D4), `/start`. 16 Nov.
- [x] D1 Privy login; the daughter becomes guardian: her Privy Stellar wallet is the guardian of her family's own purse contract, and she approves the rules with one signature.
- [x] D2 Mama: name, phone, language (and network).
- [x] D3 Mama's meter with the owner-name check. Airtime and data use Mama's phone.
- [x] D4 Light / Standard presets (calculate the monthly cap), then fund: address, QR, Get test USDC.
- [x] D5 Invite Mama: Copy link and Share on WhatsApp (`wa.me`). One use, 7-day expiry.
- [x] Invite status on the dashboard (`/dashboard`), and **[Send a new invite]** that cancels the old link.
- [x] Receipts: every top-up with its Stellar transaction link and the fee.

- [x] Pause/resume, change plan (Light ↔ Standard, or re-save at today's rate) and withdraw from the dashboard, each with her Privy signature. Withdraw opts her wallet in to USDC first if needed. 21 Nov.
- [x] Privy App ID set on Vercel; `/start` tried live (purse created, funded, Mama joined). 21 Nov.

### Step 5: Limits on-chain (20-24 Nov), Must have (one cap check) · Should have (the rest)
- [x] Decide: our own purse contract (per-utility caps and saved destinations, which an allowance can't do).
- [x] Write the contract and its tests (`contracts/purse`, 10 tests). 14 Nov.
- [x] Mhasibu calls `buy` before paying (when `PURSE_CONTRACT_ID` is set).
- [x] **Mentor's demo moment:** "Try to take 7 USDC" in the log panel (or `npm run overspend`) skips Mhasibu's own checks; the contract refuses it on-chain (per top-up cap).
- [x] **Demo moment:** ask Mhasibu to pay a number the daughter didn't save. The contract refuses, live. 20 Nov.

### Step 6: Polish and record (24-27 Nov)
- [ ] Run the golden path five times in a row without failure.
- [ ] Record the demo video (live or recorded x402 flow).
- [ ] Update the pitch deck from the Ideation & MVP slides.
- [x] README with setup steps, architecture and the GitHub link (rewritten 21 Nov, Mermaid diagrams).
- [x] Deploy for the judges: web on Vercel (care-purse.vercel.app), gateway + Mhasibu on Pxxl, Postgres on Neon, UptimeRobot (see `DEPLOY.md`). Testnet only, labelled.
- [x] Move orders, purses, purchases, tokens and chat to Postgres (`DATABASE_URL`), tested with a restart: the token comes back. 14 Nov. Hosted database: Neon (see `DEPLOY.md`).

### Step 7: Submit (27-28 Nov)
- [ ] Submission checklist: working prototype, live or recorded x402 flow, architecture docs, GitHub repo.
- [x] Final check: no `.env` or secrets in the repo (21 Nov: only `.env.example` templates are tracked). Check again before submitting.

## Demo script (3 minutes)

1. **The problem (20 s):** Adaeze in London, Mama Ngozi in Lagos, the light running out.
2. **Set up (30 s):** Adaeze's dashboard: Mama's meter saved, limits set, purse funded.
3. **The golden path (60 s):** Mama: "Abeg, light don almost finish" → options → "1" → **402** → Mhasibu pays → token in chat. Show the transaction on the Stellar testnet explorer.
4. **The rules hold (40 s):** ask Mhasibu to top up a stranger's number → refused. Then the on-chain check: an agent tries to take more than Adaeze's per-top-up cap (for example 7 USDC) → **the Soroban contract refuses it live**, shown in the log panel.
5. **Why x402 (30 s):** remove the payment and Mama gets nothing. One payment per top-up, no sign-up, no card.

## Definition of done for the Must have

- [x] One electricity top-up works end to end on Stellar testnet, from Mama's chat message to the token.
- [x] Airtime and data work through the same flow.
- [x] Every payment has a transaction link anyone can open.
- [x] No step is simulated except the utility provider (sandbox), and the UI says so.

## VTpass sandbox: done (14 Nov)

Electricity, airtime and data all pass in the VTpass sandbox (GitHub Actions workflow "VTpass sandbox"). Still to do: the "full" mode run (needs the `AGENT_SECRET_KEY` secret), and a friendly reply for VTpass's duplicate guard (`019`). See `MEMORY.md`.

### After the hackathon

Before mainnet (we are on Stellar testnet and the VTpass sandbox for now):
- [ ] SMS through Termii for Mama's sign-in code and her token (no code on screen).
- [ ] A native speaker reviews the Pidgin replies.
- [x] One agent wallet per family (21 Nov); older purses move with one approval.
- [x] Guardian confirmed as her own Privy wallet on the server (21 Nov, `PRIVY_APP_SECRET`).
- [ ] Mainnet: Circle USDC on Stellar mainnet, an off-ramp to refill the naira float, production VTpass keys.
- [ ] More than one instance per service (rate and payment holds shared through the database).

Growth:
- [ ] Mhasibu AI on WhatsApp (WhatsApp Business API): Mama chats where she already is.
- [ ] Expand beyond Nigeria, starting with Tanzania (Swahili, shillings, local electricity and mobile networks).

# CarePurse memory

Everything we have decided so far, in one place. Read this first. If a decision changes, update it here and say why.

## The product in one sentence

Mama in Nigeria asks for electricity, airtime or data in a chat. Our AI agent, **Mhasibu**, pays for it over **x402 on Stellar**, within limits her daughter sets.

- **Product name:** CarePurse
- **AI agent name:** Mhasibu AI (Swahili for "accountant"; it keeps the books for Mama's purse)
- **Hackathon:** EmpowerHer: Building the Agent Economy (Stallion). Submissions close **28 November 2026**.
- **Team:** Gloria & Rita

## Who uses it

| Person | Example | What they do |
|---|---|---|
| **Mama** (beneficiary) | Mama Ngozi, 68, Lagos | Logs in with her phone number. Chats with Mhasibu to ask for top-ups. Sees her saved meter and phone, but can't change them. |
| **Daughter** (guardian) | Adaeze, nurse in London | Signs up with a **Privy** wallet. Funds the purse in USDC. Sets the meter and phone numbers and every spending limit. Only she can change them. |
| **Relatives** (optional) | Siblings, cousins | Anyone can send USDC to the purse. Sending money gives no control. |
| **Mhasibu** (AI agent) | | Understands Mama, offers fixed options, pays the gateway over x402. Never changes rules. |

## Decisions

### Scope
- **Nigeria only.** Tanzania was dropped.
- **Three utilities:** prepaid **electricity**, **airtime** and **data**. They all use the same flow, so there are no extra steps.
- **Languages:** English and Nigerian Pidgin. Yoruba, Igbo and Hausa are "could have".
- **Channel:** chat on the **CarePurse website**, which can be added to Mama's home screen. WhatsApp comes later.
- **Testnet only.** Stellar testnet USDC.

### Sign-up and identity
- **One sign-up path: the daughter sets it up, and Mama only opens a link.** Full plan: `SIGNUP.md`.
  - The daughter has 4 screens: sign in, Mama, where the money goes, then limits and fund. She finishes with Copy link and Share on WhatsApp (a `wa.me` link only).
  - Mama has 1 screen: the link opens with her number filled in, she types the code, and the chat opens.
- **Mama can't start a purse.** If she hears about CarePurse first, she tells her daughter, who signs up and sends the link. Without a link, Mama's screen just says "Ask your child to set up CarePurse and send you the link." There's no account and no waiting state.
- **Invite links** work once and expire after 7 days. If Mama didn't use hers, the daughter can send a new one; the new link cancels the old one.
- **One guardian per purse, and one purse per Mama** for the MVP.
- **Mama:** phone number plus a one-time code. No email, no wallet, no seed phrase. For the demo, show the code on screen instead of sending an SMS. An optional 4-digit PIN protects purchases.
- **Daughter:** a **Privy** embedded wallet (email or Google login, no seed phrase). Privy lists Stellar among its supported chains. **Check first** how it signs Stellar transactions; the fallback is Stellar Wallets Kit (Freighter and others).
- **Mhasibu:** its own server-held Stellar keypair (the agent wallet), as in the workshop kit. It never holds more than the purchase in progress.

### Who sets what
- **Only the daughter** enters Mama's meter number and phone number. The gateway looks up the meter owner's name so she can confirm it's Mama's.
- **Airtime and data go to Mama's own phone number** (the one she logs in with). There's no second number in the MVP.
- Mama **cannot** add or change a meter or phone number. Nor can anyone with her phone, and nor can Mhasibu. This is how we make sure every top-up reaches Mama.
- Any change to destinations or limits needs **the daughter's wallet signature**.

### Spending limits (set by the daughter)
At sign-up she picks one of two presets, shown in naira. The app converts to USDC behind the scenes.

| Preset | Electricity | Airtime | Data |
|---|---|---|---|
| **Light** | ₦2,000 a time, ₦5,000 a week | ₦200 a time, ₦500 a day | ₦200 a time, ₦500 a day |
| **Standard** (demo) | ₦5,000 a time, ₦15,000 a week | ₦500 a time, ₦1,000 a day | ₦500 a time, ₦1,000 a day |

- **Monthly cap:** the whole-purse monthly cap is **calculated, never typed**: electricity weekly × 4, plus the airtime and data daily limits × 30. That gives ₦50,000 for Light and ₦120,000 for Standard.
- **Custom limits** are a later edit on the dashboard, not part of sign-up.

- **Smallest top-up:** **₦500 for electricity** (about 0.34 USDC) and **₦100 for airtime and data** (about 0.07 USDC).
- **Sizes Mama is offered:**
  - Electricity: ₦500, ₦1,000, ₦2,000, ₦5,000, ₦10,000.
  - Airtime and data: ₦100, ₦200, ₦500, ₦1,000, ₦2,000, ₦5,000.
  - **Only the sizes that fit the limits the daughter set** are shown. If she allows more, bigger sizes appear.
- **At a cap:** Mhasibu explains politely in Mama's language and notifies the daughter, who can raise it.
- **No borrowing:** Mhasibu can't move budget between utilities or raise a cap.
- **Duplicate check:** the same utility asked for again within 30 minutes makes Mhasibu ask "Do you want more?".
- **Confirmation:** every purchase needs Mama's confirmation in chat ("Reply 1 to buy").

### Mhasibu's rules
1. Only buy for the meter and phone numbers the daughter saved.
2. Never add, change or remove a meter or phone number.
3. Never change any limit.
4. Stay within every per-utility limit and the whole-purse limit.
5. Only pay the CarePurse gateway.
6. Only accept requests from Mama's logged-in account.
7. Confirm every purchase with Mama first.
8. If asked to break a rule, refuse politely and notify the daughter.
9. Never type an amount; only offer options the server calculated.

**"The AI proposes, the code decides"** (from the workshop). Rules 1 to 5 are enforced by code and, later, by the Soroban contract, not by the AI's prompt. Mhasibu is **not told its limits**. It only learns a limit when a purchase is refused, so a clever message can't talk it past one.

### Money in and money out
- **Money in:** anyone with Stellar USDC can fund the purse. The daughter funds it from abroad.
- **Money out:** utilities are paid in naira. In production the gateway would keep a prefunded naira float with a bills aggregator and refill it in batches. **For the hackathon, fulfilment is sandboxed:** the gateway takes the real testnet USDC payment and gets a **demo token from a sandbox utility provider**.
- **Not built:** cash-out to naira, a real biller, fiat KYC.

### x402 is the centre
- The gateway's `/paid/topup/...` route answers **HTTP 402** until paid. Mhasibu pays it automatically with `@x402/fetch`, and the facilitator settles the USDC on Stellar testnet.
- **The judges' test:** remove x402 and Mhasibu can't pay the gateway, so Mama gets no token. The payment is central, not decoration.

## Wording rules (from Gloria)
- Say **"Live Stellar Testnet payment · sandbox utility fulfilment"**. Never "real Testnet USDC, no simulation".
- Don't say "the money is often spent on something else". Say: **"Sending money home does not guarantee that the utility is restored immediately."**
- **Problem statement:** "Nigerian women living abroad who support elderly mothers at home must repeatedly interrupt their day to arrange prepaid electricity, airtime and data purchases, because existing payment flows require a human checkout. CarePurse lets Mama request a top-up through a controlled chat, while Mhasibu pays an x402-enabled gateway within limits set by her daughter."

## Things we said no to
- Chama / savings-group bookkeeping (too many teams building it)
- WhatsApp for the MVP (needs Meta approval; later)
- Mobile apps (the website works on phones)
- Tanzania and Swahili

## Where things are
- `library.md`: workshop materials and Stellar x402 docs (temporary)
- `PLAN.md`: what we build, in what order, and who does it
- `ARCHITECTURE.md`: how the parts fit together

## Agent reasoning provider (13 Nov)

- We use **OpenServ** for Mhasibu's reasoning: Claude Opus 5.5 through its Anthropic-compatible `/v1/messages`, so the code stays on the Anthropic SDK and only `LLM_BASE_URL` changes.
- **16 Nov: privacy first. Mhasibu now uses a private model on NEAR AI Cloud** (`deepseek/deepseek-v4.1-flash`, `LLM_API=openai`). Why: NEAR runs verifiable models inside TEEs (Intel TDX + NVIDIA confidential computing), so even the host cannot read Mama's messages. Claude on NEAR is marked not verifiable (it is passed through to Anthropic), so it gives no privacy gain. Compared live: DeepSeek V4.1 Flash 7/7 with strict JSON at about 2 s; GLM-5.3-flash and Qwen3.8-27B failed the strict JSON. A NEAR key is only ever sent to the OpenAI-style host, never to Anthropic. The model still only classifies; limits stay in code and on-chain.
- **16 Nov: privacy written down** (README Privacy section, ARCHITECTURE, TAD, deck slide). Checked against the code first: on-chain only sha256 fingerprints of meter/phone and order id; the x402 URL carries a random order id; the Agent & x402 Log never prints meter or phone. Honest limits listed: plain sha256 of a short number is guessable (production: HMAC per purse), the gateway's free status route is open to anyone with a 64-bit order id, JSON rows rely on Neon's encryption at rest.
- **16 Nov: all three privacy limits fixed.** (1) `destHash` = HMAC-SHA256(key, `carepurse/dest/v1:<contract id>:<number>`); key = `DEST_HASH_KEY` or derived from `AGENT_SECRET_KEY` (no new secret to manage; rotating the agent key means `npm run sync-purse`). Contract unchanged: it only compares fingerprints. Testnet purse re-synced, live ₦500 top-up went through. (2) `GATEWAY_API_KEY` on `/v1/orders*` and `/v1/meters`; without a key, loopback only; the x402 route stays open (payment is the door). Render generates it on the gateway and passes it to Mhasibu. (3) `DATA_ENCRYPTION_KEY`: AES-256-GCM per row, `kind:id` as associated data, `{"enc":"v1.…"}` in Postgres; plain rows still readable and sealed on next save. Render generates one per service.
- **16 Nov whole-stack live check** (NEAR private model, gateway key, encrypted Postgres, real contract and x402; mock delivery because this container's proxy sends a stale VTpass header, 087, while GitHub run 18 delivered real VTpass tokens on the same code): all passed, except the live log echoed chat lines with Mama's meter and a phone number. Fixed: `maskNumbers` on the log's text, keeping the last 4 digits. Re-checked: 0 of 30 events carry a number.
- **16 Nov correction (Grok review): the first model was not private.** `deepseek/deepseek-v4.1-flash` is forwarded by NEAR to OpenRouter (`verifiable: false`, no attestation); I had picked by family name without checking the flag on that exact id. Now `deepseek-ai/DeepSeek-V4.1-Flash-1017` (`verifiable: true`, served by NEAR on vLLM with attestation). It accepts `response_format` (no 400). 13/13 Mama messages answered by the model itself with the fallback off, about 2 s. It reasons first, so `max_tokens` went 300 → 1024. To stop a repeat: `nearPrivacy` reads NEAR's model list at start and `openUnderstander` refuses a model marked not verifiable (scripted parser instead, loud warning). The purse re-sync Grok flagged was already done the same day (live top-up went through after it).
- **16 Nov, second Grok review.** (a) "The private model can't return the JSON": tested, not true. With `response_format` NEAR enforced our schema on 3/3 raw calls (only allowed values); without it the model invented values (`recharge_phone_line`, `telecom`). Its feature list doesn't mention it, but vLLM's constrained output works; keeping the field. GLM/Qwen were earlier dropped for empty content at `max_tokens` 300, not for lack of JSON support; not re-tried since DeepSeek works. NEAR latency varied from ~2 s to 4-8 s (one raw call hung), so fallbacks are real: `lastVia` now marks each message in the live log as model or keyword parser. (b) "Fails open on null": true, fixed. On NEAR, send only when `verifiable === true`. (c) Purse re-sync: already done earlier the same day.
- **16 Nov, checked against three auditor posts (Zealynx).** (1) Budgets that stack / "stopping doesn't end the claim": caps already safe (the contract counts at release, one open order, refund gives room back). But a signed x402 payment stayed valid 300 s (library default) while Mhasibu refunds a failed one at once: a retry inside that window would release new USDC the old signature could take. Fixed: gateway `maxTimeoutSeconds: 60`, Mhasibu refuses offers over 120 s, and `payHoldUntil` (window + 30 s) blocks a new release after a failed payment. Tests added; live 402 shows 60. (2) Token metadata that can change: not affected; we never read name/symbol/decimals from chain (fixed in config). (3) Apps that vouch for attacker contracts: not affected; Mhasibu calls only the configured purse and USDC contracts, simulates first, and checks host, payee, asset, network and price before signing.
- **Rule (16 Nov): the ideation assignment is submitted and graded. Do not edit the ideation deck (`docs/pitch/`) or other ideation-assignment documents.**
- Opus over Sonnet: in our test Sonnet read "give my neighbour airtime" as a buy. Opus sent it to the guardian. The code also sends such requests to the guardian whatever the model says.
- NEAR AI Cloud (private inference) is a later option if privacy of Mama's messages becomes a judging point.

## Mentor feedback on the Ideation & MVP assignment (Abdul Malik Ibrahim, 13 Nov)

Praised: the two personas (Adaeze the human delegator, Mhasibu the autonomous agent), Soroban spend limits with saved meter IDs as the answer to the trust problem, the clear wire-level x402 flow, and the disciplined MoSCoW cuts (no live billers, KYC or WhatsApp).

Two tips, both now **Must have**:
1. **One live Soroban spend-cap check in the core demo**, e.g. blocking a top-up over 7 USDC, so judges see Adaeze's rules enforced on-chain.
2. **A live "Agent & x402 Log" panel next to Mama's chat** during the demo, so judges watch the 402 challenge and the Stellar Testnet settlement happen. Mama's chat itself stays very simple.

Note: the assignment described the paid route as `POST /v1/topup`. As built it is `POST /v1/orders`, then `GET /paid/topup/:utility/:ngn` (the x402 route). Use the built routes in the final deck.

## VTpass sandbox: tested 14 Nov (GitHub Actions, "VTpass sandbox" workflow)

- Works: meter check ("TESTMETER1", Ikeja Electric), ₦500 electricity with a 20-digit token (79.9 kWh), ₦100 MTN airtime, ₦500 MTN data.
- **Commission:** VTpass charges us less than face value; Mama still gets the full amount. Electricity 1.5% (₦500 cost ₦492.50), MTN airtime 3.5% (₦100 cost ₦96.50). In production that margin is CarePurse's revenue.
- **Account setup that blocked us:** API Settings needs "API Keys" chosen **and SUBMIT pressed** (else `087 INVALID CREDENTIALS`); each product must be switched on in Product Settings (else `028 PRODUCT IS NOT WHITELISTED`).
- **`019 LIKELY DUPLICATE TRANSACTION`:** VTpass refuses a second purchase to the same number within a few minutes. The gateway refuses the top-up, so x402 doesn't settle and Mama isn't charged. Mhasibu should tell her to try again in a few minutes (to do).
- **Data bundles:** the variation list mixes data with talk-time bundles ("Xtratalk"); we pick only MB/GB bundles, and only at **exactly** the tier price. A tier with no exact bundle is hidden from Mama (MTN sandbox has no ₦500 data bundle), so she never pays ₦500 for a ₦200 bundle.
- VTpass needs two key headers per request, so in cloud sessions the keys live in GitHub secrets / Render env vars, not the session's network secret.

## Review fixes (14 Nov, from Grok's review, each verified first)

- **Stellar Lab links:** `/transaction-dashboard` and `/transaction/simulate` now redirect (308); `library.md` uses `/transaction/dashboard` and `/transaction/build`. Account setup is split: keypair on `/account/create`, Friendbot and the USDC trustline on `/account/fund`. Removed the "nothing goes against the Stellar docs" line.
- **Refund after a failed payment (real bug, fixed):** `buy` releases USDC and counts the spend before x402 runs. If the payment then failed, the USDC sat in the agent wallet and the cap stayed used. The contract now has `refund(order_ref)` (agent only, once per order): it returns the USDC to the purse and takes the spend off the caps. Mhasibu calls it whenever the payment fails after a release; if the refund itself fails, Adaeze is asked to check. Tested live on testnet. New contract v2 `CBKVT2…CDIP`; v1 retired, its USDC returned to the guardian.
- **Purse cap:** the review said it was never set. On the live v1 contract it was set by `deploy-purse` (read from storage: 81.63 USDC = ₦120,000), but `sync-purse` did not re-send it. `sync-purse` now sets it, and the contract has `purse_cap()` to read it.

## Second review (14 Nov, Grok), each point checked against the code and ARCHITECTURE.md

1. **Failed refund hides the USDC: true.** Fixed by retrying the refund, recording an *unconfirmed* spend when it still fails (code caps match the chain), retrying on the next message, and telling Mama "I can't confirm it yet" instead of "you weren't charged". **Not done as suggested:** adding the agent's stuck USDC to Mama's balance, because `buy` can't spend it, so Mama would be offered money the contract then refuses.
2. **Refund can restore a cap on a paid order: true, narrower than stated.** The purse total stays right (each refund returns real USDC), but a compromised agent could move spend between utilities. Fixed in the contract with "refund only the latest order", not the proposed `commit` step: same protection, without an extra transaction per top-up.
3. **Order records not kept alive: true.** My first fix used a 1-day threshold, which never fires on testnet (new entries start at about 7 days), so it did nothing; caught by the live check and fixed (threshold just under 30 days). Live: about 31 days.
4. **sync-purse could write "no cap": possible, not happening** (our purse had `monthlyCap`). Both scripts now recompute it from the limits and refuse to write 0.
5. **"card" made "NEPA card" airtime: true.** Removed; "recharge card" still matches via "recharge".

Contract **v4** `CBWQ4EQSCNTDRQFJ6YLZT2GOUEHKA6N233IKZBGOVHKMZDQ5R2AG5OBV` (v1, v2 and v3 retired, their USDC returned to the guardian). Tests: contract 14, Mhasibu 22, gateway 12.

## How Mama gets her electricity token (14 Nov)

- **In the chat**, right after paying. VTpass does not send an SMS itself (its docs say the seller should show the token and may SMS or email it), and the sandbox sends nothing.
- **It must never be shown once and lost.** Now: kept on the gateway's order and on Mhasibu's purchase record; included in Adaeze's receipt; Mama can ask again in any words or press 5 on the menu; the chat pins "Last light token" with a Copy button.
- **Still to do:** SMS to Mama's phone (production, via an SMS provider), and a database before hosting, because Render's free plan wipes files on restart and would lose stored tokens.

## Database (14 Nov)

- **Postgres via `DATABASE_URL`**, one table `carepurse_records (kind, id, doc jsonb)`; the gateway and Mhasibu can share it. Without a URL, the JSON files in `.data/` are used (local dev, tests, GitHub Actions).
- **Design:** the stores stay in memory and synchronous (so the payment logic and its conditional status changes don't change), load from Postgres at start, write every change in order, and wait for the write before answering Mama or returning a token. A database error is logged and never blocks a token already issued. Assumes one instance per service.
- **Host:** Neon free tier (doesn't expire). Not Render's free Postgres (deleted after 30 days, mid-December) or Supabase free (pauses after a week idle).
- **Tested:** real Postgres tests (`TEST_DATABASE_URL`), and live: bought ₦500 of light, restarted both services, "send my token again" returned the same token.

## Third review (14 Nov, Grok): a second `buy` stranded the first release, fixed

- **True.** If a payment failed and the refund also failed (or the process crashed after the release), the next `buy` made the earlier order "not latest", so it could never be refunded and its USDC stayed on the agent wallet.
- **Fixed as proposed, in the contract (v5) and Mhasibu:** `commit` after a successful payment; `buy` refuses while the last order is open; a committed order can't be refunded; guardian escape hatch `guardian_close`. Mhasibu writes the open order down before `buy`, settles any open order first on the next message (gateway order status decides commit or refund, and recovers the token), and starts nothing new until it's settled. Balance = purse + USDC on the agent; unconfirmed top-ups labelled in history.
- Cost: one extra on-chain call (`commit`) per top-up, a few seconds after Mama already has her token.
- Contract **v5** `CAMXGONVKRA2KVWGJIXLLQEFZI4TFPHO3X7I5JMI4WUTY35GNVJW32FG`. Tests: contract 16, Mhasibu 26, gateway 13 (+1 Postgres test each).

## Fourth review (14 Nov, Grok), checked against ARCHITECTURE.md and PLAN.md

- **A slow `buy` reported as free: true** (my catch deleted the open order on any error). Now only a contract refusal clears it; any other error keeps it, Mama hears "can't confirm yet", and the next message asks the chain.
- **Lost order id: true.** Settlement now works from the contract's reference (hash), with a gateway lookup by reference. No contract change needed: `refund`/`commit` already take the hash.
- **`guardian_close` on an unpaid order: true, it burns the cap and leaves the USDC.** Notifications no longer suggest it; documented as last resort for a lost key.
- **Issued token with failed settlement: true. Fixed differently** from "keep it and don't refund" (that would leave the USDC on the agent and the gateway unpaid): Mama keeps the token, Mhasibu pays the gateway the exact amount directly (recovery only), then commits.
- **Added `upgrade` (guardian only)** at the user's request: v6 `CCJMZQ47JXY3CT6OKWGD4AUQFSRDHRMPOBHOGCCXXVKVFG5RTLQ3B3XC` is the last redeploy; later fixes keep the address (`npm run upgrade-purse`).
- Tests: contract 17, Mhasibu 29, gateway 14. Live: upgrade in place; timeout and lost-id cases refunded; normal top-up committed.

## Service fee (14 Nov), modelled on Ponte

- **Ponte** (`src/lib/catalog.ts`): `SPEND_FEE = 0.03`, a 3% markup on provider-delivered items "covering provider fees and price movement", shown as "incl. 3% fee"; live CoinGecko rate at order time; gift codes at face value; swaps 0.5%. It also keeps the aggregators' (VTpass, ClubKonnect) reseller discount.
- **CarePurse:** 3% service fee on top of face value (`SERVICE_FEE_BPS=300`), carried by the x402 price, paid from the purse. **Mama never sees it** (decision 14 Nov); Adaeze does, in receipts. Limits in face value; balance rule and on-chain caps include the fee (caps re-sent with `sync-purse`). Revenue = fee + VTpass discount (about 4.5% on electricity, 6.5% on MTN airtime) before off-ramp costs.
- **Found while testing:** `@x402/fetch` has a default `$1` per-payment ceiling, so every top-up above about ₦1,470 had been silently refused (earlier tests only bought ₦500 or less). Now set to the largest top-up plus fee ($7.01). Live: ₦5,000 of light paid 3.5034014 USDC, receipt "Charged ₦5,150 (₦5,000 + ₦150 service fee)".
- Production: replace the fixed `NGN_PER_USDC` with a live rate at order time (Ponte uses CoinGecko).

## Fifth review (14 Nov, Grok, two reports), checked against library.md and the code

- **Recovery pay could race the facilitator: true.** The gateway records `issued` while still `fulfilling`, and the direct-pay check came before "wait". Now: `created` and not expired, or `fulfilling` under 30 minutes → wait (no pay, no refund); direct pay only after settlement can no longer happen and a token was issued; otherwise refund. Chain-only orders take their start time from the gateway (`createdAt`), fixing the missing `at`.
- **The agent API was open: true.** Fixed with `MHASIBU_API_KEY` on every route but `/v1/status`, and a server-side relay in the web app (`/api/mhasibu/...`) that adds it. **Not done as suggested:** sending the secret from the web app, because anything in a browser page is readable by whoever opens it. Optional `WEB_ACCESS_CODE` locks the demo link. Overspend now uses a fixed amount (on-chain cap + 1 base unit) and refunds if ever accepted.
- Live: without the key every private route answered 401; with the code the demo worked end to end, including the live log stream; an overspend request asking for 1 USDC was ignored and the cap+1 attempt refused on-chain.
- Still open: Mama's own login (phone + invite code) instead of one shared link.

## Sixth review (14 Nov, Grok)

- **`SERVICE_FEE_BPS=0` stopped the gateway from starting: true** (it was read with the "positive number" helper). Both services now read it as a whole number from 0 to 1000; 0 switches the fee off. Regression test added (gateway 16 tests).
- **Set `WEB_ACCESS_CODE` before going public: right**, so it's now enforced: in production the web app's relay keeps Mama's chat closed (503) unless a code is set. Checked on a production build: no code configured → 503; code set → no or wrong code 401, right code 200.


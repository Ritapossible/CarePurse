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
- **Data bundles:** the variation list mixes data with talk-time bundles ("Xtratalk"); we now pick only MB/GB bundles.
- VTpass needs two key headers per request, so in cloud sessions the keys live in GitHub secrets / Render env vars, not the session's network secret.


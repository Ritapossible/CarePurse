# Mhasibu AI

The agent in CarePurse. It reads Mama's message (English or Nigerian Pidgin), works out what she may spend, runs every rule in code, and pays the CarePurse gateway over **x402 on Stellar testnet**.

> Live Stellar Testnet payment · sandbox utility fulfilment

**The AI proposes, the code decides.** The model only classifies the message. It never writes a reply, never sees the limits, never picks an amount and never decides to pay. Replies are fixed templates, and Mama only ever sees naira.

## Try it

The gateway must be running (`cd services/gateway && npm start`), with funded wallets (`npm run setup && npm run get-usdc` there).

```bash
cd packages/mhasibu
npm install
npm run chat                                                   # chat as Mama
npm run chat -- "Abeg, light don almost finish" "1"            # send messages and exit
npm test                                                       # offline tests, no money moves
npm run serve                                                  # API for the web app (port 4022), with the live log stream
npm run deploy-purse                                           # Phase 2: deploy the purse contract (see contracts/purse)
npm run overspend                                              # Phase 2 demo: ask the contract for 7 USDC; refused on-chain
npm run fund-purse -- 100 50                                   # the daughter buys test USDC (testnet exchange) and deposits into the purse
```

**Phase 2 (limits on-chain):** with `PURSE_CONTRACT_ID` set, Mhasibu calls the purse contract's `buy` after its own checks and before paying. The contract checks the guardian's caps and saved destination and releases exactly one top-up to the agent wallet; then the x402 payment goes out as usual. If the contract says no, nothing is paid.

The demo purse is Mama Ngozi (Pidgin), guardian Adaeze, meter `1111111111111` and phone `08011111111` (the VTpass sandbox's test numbers), Ikeja Electric, MTN, Standard limits. It's seeded into `.data/purses.json` until the daughter's dashboard exists.

## Understanding Mama

| Mode | When | How |
|---|---|---|
| **Claude** | `LLM_API_KEY` (or `ANTHROPIC_API_KEY`) is set | Claude Opus 5.5 through OpenServ (`LLM_BASE_URL=https://inference-api.openserv.ai`, `LLM_MODEL=claude-opus-5.5`), or Anthropic directly with `LLM_BASE_URL` empty and `claude-opus-5-5`. Effort `low`, structured output with a fixed schema: `intent`, `utility`, `choice` |
| **Scripted** | No key, or Claude fails or refuses | Keyword rules for English and Pidgin ("light don finish", "my data don finish", "recharge my line"), with typo correction: a word one letter off (two for long words) is read as the nearest keyword ("ligt" → light, "airtym" → airtime) |

**When Mhasibu doesn't understand,** it says so and offers a one-digit menu: 1) Light 2) Airtime 3) Data 4) How much is left. A greeting gets the same menu. Nothing is ever bought on a guess: Mama still picks a size, and every rule still runs.

**When the provider says wait** (VTpass refuses a repeat to the same number within minutes), Mama hears "try again in 5 minutes". The gateway refused, so x402 didn't settle and she wasn't charged.

One model call per message, well under the workshop kit's cap of 8 steps.

## The rules, in order (the first "no" wins)

Run before ordering, and again with the real 402 before signing:

1. **Allowlist:** the 402 comes from our gateway's host, pays `GATEWAY_RECIPIENT`, in testnet USDC, on `stellar:testnet`.
2. **Quoted price:** the 402 amount equals the order's amount. On top of that, the x402 client's own `policies` filter refuses any other offer at signing time.
3. **Destination:** only the meter or phone the guardian saved. Any other 10 to 13 digit number, or a request for someone else ("my neighbour", "send ... to", "raise my limit"), is treated as a change request and forwarded to the guardian, whatever the AI understood.
4. **Paused:** the guardian paused the purse.
5. **Limits:** per top-up, per day (airtime, data), per week (electricity), the calculated purse monthly cap, and the purse balance. Periods follow Lagos time, and weeks start on Monday.
6. **Mama said yes:** she picked a numbered option. Options expire after 10 minutes, and silence means no.

**Duplicate check:** asking for the same utility again within 30 minutes adds "You bought ₦X a short while ago. Do you want more?".

**Guardian notifications:** a receipt for every purchase, plus a notice for every refusal, limit reached, low balance or change request. They're stored on the purse for the dashboard.

## Files

| File | What it is |
|---|---|
| `src/mhasibu.mjs` | One message in, one reply out: understand, offer, check, pay, notify |
| `src/limits.mjs` | Presets (Light, Standard), the calculated monthly cap, Lagos-time periods, the rule checks |
| `src/understand.mjs` | Claude classifier with a fixed schema, plus the scripted English/Pidgin parser |
| `src/replies.mjs` | Every reply, in English and Pidgin. Naira only. |
| `src/wallet.mjs` | Gateway calls, the 402 quote, and the x402 payment with an exact-match policy |
| `src/purses.mjs` | Purses in `.data/purses.json`, with the seeded demo purse |
| `bin/chat.mjs` | Terminal chat as Mama |
| `bin/serve.mjs` | The API for `apps/web`: chat, history, status and the live Agent & x402 Log (Server-Sent Events) |
| `src/purse-contract.mjs` | Calls to the purse contract (`buy`, reads), error codes, naira to base units for caps |
| `scripts/deploy-purse.mjs`, `scripts/overspend.mjs` | Deploy and set up the purse contract; the on-chain refusal demo |
| `test/mhasibu.test.mjs` | Offline tests: golden path, weekly limit, tampered 402s, foreign numbers, expiry, Claude fallback |

**Phase 1 note:** Mhasibu's agent wallet **is** the purse, so its USDC balance is the hard limit (the workshop's third safety layer). One agent wallet per purse.

# CarePurse reference library

Material from the EmpowerHer "Agentic Payment & x402 on Stellar" workshop (12 November 2026), plus the Stellar docs it points to. We'll use it while building CarePurse. **Temporary file: delete it once the build no longer needs it.**

Everything here is **Stellar testnet only**.

## Contents

1. [The links](#1-the-links)
2. [Key values to copy into our config](#2-key-values-to-copy-into-our-config)
3. [How x402 works on Stellar](#3-how-x402-works-on-stellar)
4. [Workshop slides: what matters for us](#4-workshop-slides-what-matters-for-us)
5. [The workshop kit (Koxy's repo)](#5-the-workshop-kit-koxys-repo)
6. [Live demos](#6-live-demos)
7. [Stellar docs: x402 and the Built on Stellar facilitator](#7-stellar-docs-x402-and-the-built-on-stellar-facilitator)
8. [How this maps to CarePurse](#8-how-this-maps-to-carepurse)
9. [Things to check before we rely on them](#9-things-to-check-before-we-rely-on-them)
10. [Checked against these resources (13 November 2026)](#10-checked-against-these-resources-13-november-2026)
11. [Stellar Lab and the Stellar docs check (14 November 2026)](#11-stellar-lab-and-the-stellar-docs-check-14-november-2026)

---

## 1. The links

| What | Link |
|---|---|
| Workshop slides | https://docs.google.com/presentation/d/1vCA-r_mRtzHwciS_Ui1o7-L_T2BtjykFQ6bJbAAsOFE/edit?usp=sharing (with speaker notes) |
| Workshop slides, second copy | https://docs.google.com/presentation/d/1iLywzcGRrSDlUzPDGRtOsJpDBl4uDRC_3_N96imDNCA/edit (same deck; needs sign-in) |
| Workshop kit (code) | https://github.com/KoxyG/x402-stellar-empower-Her |
| Workshop kit, hosted demo (Agent Console) | https://x402-stellar-empower-her.onrender.com/ |
| Stellar's own x402 demo endpoint (returns a real 402) | https://stellar.org/x402-demo/api/protected/testnet |
| Stellar docs: x402 on Stellar | https://developers.stellar.org/docs/build/agentic-payments/x402 |
| Stellar docs: Built on Stellar facilitator | https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar |
| Kit architecture diagrams (from the slides) | https://claude.ai/artifact/KDnT4KpAiZpc3Py9D9XwnQ |
| Agentic payments on Stellar (x402 and MPP) | https://developers.stellar.org/docs/build/agentic-payments |
| Token allowances for agents (on-chain limits) | https://developers.stellar.org/docs/tools/cli/agent-cli/guides/delegate-spending |
| Stellar's x402 examples | https://github.com/stellar/x402-stellar |
| x402 protocol and SDKs | https://github.com/x402-foundation/x402 |
| Stellar docs for AI tools | https://developers.stellar.org/llms.txt |
| Testnet USDC faucet | https://faucet.circle.com (choose Stellar Testnet) |
| Testnet explorer | https://stellar.expert/explorer/testnet |
| Stellar Lab (build, sign, inspect transactions; Friendbot; trustlines) | https://lab.stellar.org |
| Stellar Lab docs | https://developers.stellar.org/docs/tools/lab |
| Stellar networks (testnet resets) | https://developers.stellar.org/docs/networks |

---

## 2. Key values to copy into our config

From the kit's `.env.example`, checked against the Stellar docs and the live 402 from Stellar's demo endpoint.

| Setting | Testnet value |
|---|---|
| Network id (CAIP-2) | `stellar:testnet` (mainnet: `stellar:pubnet`) |
| Network passphrase | `Test SDF Network ; September 2015` |
| Horizon (accounts, balances, trustlines) | `https://horizon-testnet.stellar.org` |
| Stellar RPC (smart contracts; x402 signs through this) | `https://soroban-testnet.stellar.org` |
| USDC classic issuer (for trustlines) | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| USDC SEP-41 contract (what x402 calls `transfer` on) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| USDC decimals | **7** (1 USDC = 10,000,000 base units; not 6 like on EVM chains) |
| Facilitator, primary: Built on Stellar (OpenZeppelin) | `https://channels.openzeppelin.com/x402/testnet`, needs a free key from `https://channels.openzeppelin.com/testnet/gen` |
| Facilitator, backup: Coinbase | `https://x402.org/facilitator`, testnet only, no key needed |

Mainnet, for later only: USDC issuer `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`, contract `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75`, facilitator `https://channels.openzeppelin.com/x402` (key from `https://channels.openzeppelin.com/gen`, GitHub login).

**Price conversion:** `amount = round(price_in_usd × 10^7)`. For example, 0.001 USDC is `"10000"` and 3.40 USDC is `"34000000"`.

---

## 3. How x402 works on Stellar

```
Agent (buyer)              Paid API (seller)          Facilitator              Stellar testnet
     │  GET /paid/...            │                         │                        │
     │──────────────────────────►│                         │                        │
     │  402 + PAYMENT-REQUIRED   │                         │                        │
     │◄──────────────────────────│                         │                        │
     │ check own rules,          │                         │                        │
     │ sign Soroban auth entry   │                         │                        │
     │  retry + PAYMENT-SIGNATURE│                         │                        │
     │──────────────────────────►│  verify + settle        │                        │
     │                           │────────────────────────►│  USDC transfer         │
     │                           │                         │───────────────────────►│
     │  200 + data               │                         │                        │
     │    + PAYMENT-RESPONSE     │                         │                        │
     │◄──────────────────────────│                         │                        │
```

1. **Ask:** the client requests a paid route.
2. **Quote:** the server answers `402 Payment Required`. The `PAYMENT-REQUIRED` header (base64 JSON) holds the price, asset, network and `payTo` address.
3. **Sign:** the client signs a **Soroban authorization entry** for the USDC contract's `transfer(from, to, amount)`, with an expiry.
4. **Retry:** the client sends the same request again with the `PAYMENT-SIGNATURE` header.
5. **Settle:** the facilitator verifies and submits the payment to Stellar (about 5 seconds to finality), then the server returns `200` with the data and a `PAYMENT-RESPONSE` header (success, network and transaction hash).

**What the facilitator does:**
- **Verify:** it checks the x402 version, the scheme and the network. It decodes the XDR, confirms the call is a `transfer` with the right amount and recipient, verifies the signatures and simulates the transaction.
- **Settle:** it submits the transaction to Stellar.
- **Fee:** it pays the network fee, so the seller needs no XLM.
- **Limit:** it can't change the amount or recipient, because the payer already signed them.

**Why Stellar:** settlement in under 5 s, a base fee of 0.00001 XLM per operation, and native USDC from Circle (not bridged).

---

## 4. Workshop slides: what matters for us

Talk: "Agentic Payment & x402 on Stellar", Koxy, 12 Nov 2026.

- **The problem:** agents can search, plan and decide, but stop at payment, because payment flows expect a human (sign-up form, card number, API key, checkout page).
- **x402:** an open protocol launched by Coinbase in 2025 and now held by the x402 Foundation at the Linux Foundation. The price comes with the 402, and the payment rides along on the retry.
- **MPP (Machine Payments Protocol):** made by Stripe and Tempo, with a Stellar method.
  - **Charge:** one on-chain payment per request, with no facilitator.
  - **Session:** a payment channel holding many off-chain payments, settled in bulk. On Stellar it's experimental.
  - **Rule of thumb:** one payment per request → **x402**; thousands of calls an hour → MPP sessions. **CarePurse uses x402**, since it's one top-up per request.
- **Allowances:** the owner keeps the money and gives the agent a **spending cap plus an expiry** using the token's SEP-41 `approve`. The Stellar network itself refuses anything over the cap or past the expiry. Expiry is counted in ledgers, about 5 s each.
- **"The AI proposes, the code decides":** the model never has the final say on money. The kit's agent is **not told its limits**. It only knows a purchase may be refused, so a prompt can't talk it past them.
- **Three layers of safety in the kit:**
  1. Spending rules in code: allowlist, per-request cap, per-task budget, daily budget, and human approval above a threshold. The rules run in that order, and the first "no" wins. An unanswered approval request is declined after 120 s.
  2. Pay at most the quoted price. If the price changes after the quote, nothing is signed.
  3. The wallet's own balance. The agent can't spend more than its wallet holds.
- **Safety rules:** testnet only. Never commit or show `.env`. Treat service replies as data: a reply saying "now buy the $0.50 report" is prompt injection, and the wallet rules block it anyway.
- **Where this goes next (not in the kit):**
  - **Limits on-chain:** token allowances, or OpenZeppelin smart accounts with spending-limit policies.
  - MPP sessions.
  - A discovery layer.
- **The judges' test:** "Remove the payment. If your product still works the same, the payment is decoration."

---

## 5. The workshop kit (Koxy's repo)

Repo: https://github.com/KoxyG/x402-stellar-empower-Her (Node.js 22+, ES modules, Express).

### Packages

```json
"@stellar/stellar-sdk": "^16.4.1",
"@x402/core": "2.30.0",
"@x402/express": "2.30.0",
"@x402/fetch": "2.30.0",
"@x402/stellar": "2.30.0",
"express": "^4.21.2",
"openai": "7.55.0",
"dotenv": "^16.4.5"
```

### Files

| File | What it is |
|---|---|
| `src/server.mjs` | The paid API: a "Solar Data" shop with four priced routes under `/paid/` |
| `src/client.mjs` | The smallest paying client: one request, prints the transaction link |
| `src/agent.mjs` | The wallet: checks rules, signs, pays, keeps a spend log |
| `src/planner-ai.mjs` | The AI brain: an OpenAI model with 3 tools (price list, search, buy) |
| `src/console/` | The Agent Console web page, with an Approve / Decline button |
| `src/config.mjs` | Reads every setting from `.env` |
| `scripts/setup.mjs` | Creates and funds two testnet wallets (server and agent), with XLM and USDC trustlines |
| `scripts/check.mjs` | Preflight check of the wallets and facilitator |
| `scripts/peek.mjs` | Shows a 402 in plain English without paying |
| `docs/troubleshooting.md` | Fixes for common errors |

### Commands

```bash
npm install && npm run setup   # .env + two funded testnet wallets
npm run check                  # expect "✓ Ready to demo."
npm run server                 # paid API on http://localhost:4021
npm run console                # Agent Console on http://localhost:4022
npm run peek                   # see a 402, no payment
npm run client                 # one paid request
npm run agent                  # the agent in the terminal
```

After `setup`, fund the agent address with testnet USDC at faucet.circle.com. For the quickest start, set `FACILITATOR=backup` (Coinbase, no key).

### Seller side: putting a price on a route (`src/server.mjs`)

```js
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";

const usd = (dollars) => ({ amount: String(Math.round(dollars * 10 ** 7)), asset: USDC_CONTRACT_ID });

const routesConfig = {
  "GET /sun-forecast": {
    accepts: { scheme: "exact", price: usd(0.001), network: "stellar:testnet", payTo: RECIPIENT },
    description: "Today's solar conditions",
    mimeType: "application/json",
  },
};

const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  // only for the OpenZeppelin facilitator:
  createAuthHeaders: async () => {
    const h = { Authorization: `Bearer ${API_KEY}` };
    return { verify: h, settle: h, supported: h };
  },
});

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("stellar:testnet", new ExactStellarScheme());
app.use("/paid", paymentMiddleware(routesConfig, resourceServer));
```

Patterns worth copying:
- **Fail closed:** if the recipient address is missing or invalid, paid routes return 503 and never serve data for free.
- **Log the reason** for every verify or settle failure, so a failed demo can be diagnosed on the spot.

### Buyer side: paying automatically (`src/client.mjs`)

```js
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const signer = createEd25519Signer(AGENT_SECRET, "stellar:testnet");
const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "stellar:testnet", client: new ExactStellarScheme(signer, { url: RPC_URL }) }],
});

const res = await paidFetch(url);            // 402 → sign → retry happens inside
const settlement = decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE"));
// settlement.success, settlement.network, settlement.transaction (tx hash)
```

### Spending rules (`.env`, no code changes needed)

```bash
AGENT_TASK_BUDGET_USD=0.05        # most one task may spend
AGENT_MAX_PER_REQUEST_USD=0.02    # anything pricier is refused
AGENT_ALLOWED_HOSTS=localhost:4021
AGENT_APPROVE_ABOVE_USD=0.005     # ask a human above this
AGENT_APPROVAL_TIMEOUT_SECONDS=120
AGENT_DAILY_BUDGET_USD=0.5
AGENT_MAX_STEPS=8                 # stop a confused model from looping
```

### Deploying (Render)

- **Build and start:** build command `npm ci`, start command `npm start`, which runs the console on Render's port and the paid API on 4021 inside the service.
- **Environment:** paste the `.env`, then delete `PORT` and `STELLAR_RECIPIENT_SECRET`.
- **Key exposure:** the console holds the agent's wallet key, so anyone with the link can spend from it. Use a small testnet balance.
- **Free plan:** the service sleeps after 15 minutes idle.

---

## 6. Live demos

### Hosted kit: https://x402-stellar-empower-her.onrender.com/

The kit's Agent Console. You type a task, pick the AI or Scripted brain, watch each decision, and approve purchases above the threshold. It runs one agent at a time and has a single shared Approve button. On the free plan the first visit after an idle period takes about a minute.

### Stellar's demo endpoint: https://stellar.org/x402-demo/api/protected/testnet

A plain `GET` returns `HTTP 402` with body `{"error":"Payment required"}`. The `payment-required` header decodes (base64) to:

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": {
    "url": "https://stellar.org/x402-demo/api/protected/testnet",
    "description": "Access to protected content",
    "mimeType": ""
  },
  "accepts": [{
    "scheme": "exact",
    "network": "stellar:testnet",
    "amount": "100000",
    "asset": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    "payTo": "GCHEI4PQEFJOA27MNZRPQNLGURS6KASW76X5UZCUZIXCOJLKXYCXOR2W",
    "maxTimeoutSeconds": 300,
    "extra": { "areFeesSponsored": true }
  }]
}
```

So 0.01 USDC (`100000` base units) on testnet, with fees sponsored. **This is the exact shape our gateway's 402 should follow.** Try it:

```bash
curl -si https://stellar.org/x402-demo/api/protected/testnet | grep -i payment-required | cut -d' ' -f2 | base64 -d
```

---

## 7. Stellar docs: x402 and the Built on Stellar facilitator

### x402 on Stellar (developers.stellar.org/docs/build/agentic-payments/x402)

- **Payment method:** clients pay with **signed Soroban authorization entries**. A wallet must support auth-entry signing to be x402-compatible. See "Method 2: auth-entry signing": https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations
- **Assets:** any SEP-41 token works; USDC is the default.
- **Facilitators:**

| Facilitator | Networks | Notes |
|---|---|---|
| Coinbase | Testnet | Sponsors fees. https://www.x402.org/facilitator/supported |
| Built on Stellar (OpenZeppelin) | Testnet and mainnet | x402 v2. Testnet: https://channels.openzeppelin.com/x402/testnet |
| Vellar (community) | Testnet | Not audited. Has an optional discovery catalog. https://docs.vellar.xyz |

- **x402-compatible wallets:** Varial (extension and mobile via WalletConnect), Hana, HOT, Klever, OneKey, Scopuly.
- **Example projects:**
  - https://github.com/stellar/x402-stellar
  - Starter template: https://github.com/ElliotFriend/x402/tree/stellar-browser-wallet-example/examples/typescript/fullstack/browser-wallet-example
  - https://github.com/oceans404/1-shot-stellar/tree/main/x402-app

### Built on Stellar facilitator (…/x402/built-on-stellar)

- **What it is:** a free, public facilitator built on the OpenZeppelin Relayer with the x402 Facilitator Plugin. It sponsors fees, finalises in about 5 s, and exposes `/verify`, `/settle` and `/supported`.
- **API keys:**
  - Testnet keys need no login.
  - Mainnet keys need a GitHub login.
  - A key can't be retrieved after creation, so store it safely.
- **Prices:** set either as `"$0.001"` (the SDK assumes USDC) or as an explicit `{ asset, amount }` in base units.
- **What it checks:**
  - Version, scheme and network.
  - That the XDR is an `invokeHostFunction` calling `transfer`.
  - Amount and recipient.
  - The signatures, plus a simulation of the transaction.
- **Authorisation model:** the signed entry names the token contract, `transfer(from, to, amount)` and an expiry. That gives sponsored fees, no sequence-number conflicts and replay protection.
- **Self-hosting guide:** https://docs.openzeppelin.com/relayer/1.4.x/guides/stellar-x402-facilitator-guide

---

## 8. How this maps to CarePurse

| Workshop kit | CarePurse |
|---|---|
| Solar Data shop (`src/server.mjs`) | **CarePurse gateway**: an order (`POST /v1/orders`), then the paid route `GET /paid/topup/:utility/:ngn` for electricity, airtime and data |
| Prices fixed per route | Fixed price tiers per route (₦500 to ₦10,000 electricity, ₦100 to ₦5,000 airtime and data), quoted as USDC in the 402 |
| AI agent with 3 tools | **Mhasibu**: tools to read Mama's saved meter and phone, quote a top-up, and buy |
| Wallet rules in code (Layer 1) | Per-utility caps, the purse cap and saved destinations, in code (Phase 1). Phase 2 moves them **on-chain** (Soroban), which is the workshop's own "next step" |
| Human approval above a threshold | Mama picks a numbered option for every purchase; silence for 10 minutes means no |
| Agent not told its limits | Same: the model only classifies Mama's message and never sees the limits |
| Solar demo data | Sandbox utility provider returns a demo token |
| Agent Console | Mama's chat and Adaeze's dashboard |

**The judges' test for us:** remove x402, and Mhasibu can't pay the gateway, so Mama gets no token. The payment is central, not decoration.

**Language for the demo** (Gloria's wording): "Live Stellar Testnet payment · sandbox utility fulfilment".

---

## 9. Things to check before we rely on them

- **Package name:** the docs mention the npm package `x402-stellar`, while the kit uses the `@x402/*` packages (2.30.0). Follow the kit, which we know runs.
- **Scheme name:** the Built on Stellar page lists the scheme as `exact` in one place and `exact-v2` in another. The live 402 uses `exact`.
- **Kit limits live in code, not on-chain:** if we want Soroban-enforced caps, read the token allowances guide and OpenZeppelin smart accounts first: https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account
- **USDC decimals:** 7 decimals on Stellar. Double-check every base-unit conversion.

---

## 10. Checked against these resources (13 November 2026)

`ARCHITECTURE.md` and `PLAN.md` were compared with the workshop slides, the workshop kit, both Stellar docs pages, Stellar's live 402, and the Ideation & MVP assignment material. Nothing in them goes against those resources. These eight gaps were fixed:

1. **Allowlist and quoted price:** Mhasibu now checks every 402 (host, amount, payTo, asset, network) before signing. These are the kit's allowlist and Layer 2.
2. **One agent wallet per purse:** so the wallet's balance is a real hard limit for each family. This is the kit's Layer 3.
3. **Silence means no:** if Mama doesn't confirm within the order's 10 minutes, nothing is bought. This matches the kit's approval timeout.
4. **Step cap:** at most 8 model steps per message, like the kit's `AGENT_MAX_STEPS`.
5. **Limits and `max_ngn`:** the gateway doesn't know the limits. Mhasibu computes `max_ngn`, and the docs now say so.
6. **Settlement order:** the docs now match how `@x402/express` really works (verify, then our handler, then settle). They also note the gap for a live biller.
7. **Allowance option:** token allowances are now described as the simpler Phase 2 fallback, with the trade-off spelled out (one total cap, no per-utility caps).
8. **Deploy step:** the plan now has a Render deploy step, as in the kit, so the judges get a working prototype link.

**Second workshop link checked:** `docs.google.com/presentation/d/1iLywzcGRrSDlUzPDGRtOsJpDBl4uDRC_3_N96imDNCA` (also shared as `AGENTIC_PAYMENT__X402_ON_STELLAR.pdf`) is the **same deck** as the first link: Koxy's "Agentic Payment & x402 on Stellar", 25 slides, 12 November 2026. Its slides match section 4 above exactly; the PDF just has no speaker notes. Nothing new, and nothing in it goes against our docs.

---

## 11. Stellar Lab and the Stellar docs check (14 November 2026)

### Stellar Lab (https://lab.stellar.org)

Stellar's web tool for building, testing and exploring the network. Nothing to install. What we'll use it for:

| Lab page | What we use it for |
|---|---|
| [Create account](https://lab.stellar.org/account/create) | Make a keypair (only that: it doesn't fund the wallet or add a trustline) |
| [Fund account](https://lab.stellar.org/account/fund) | Get test XLM from Friendbot, and add the USDC trustline with its button |
| [Build transaction](https://lab.stellar.org/transaction/build) | Add a trustline by hand: operation **Change Trust**, asset `USDC`, issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, network **Testnet**. Also where to try (simulate) a transaction before sending it |
| [Endpoints](https://lab.stellar.org/endpoints) | Look up a wallet's balances and trustlines (Horizon), or call Stellar RPC methods |
| [Transaction dashboard](https://lab.stellar.org/transaction/dashboard) | Open a top-up's tx hash and see the USDC `transfer`, its result and any failure |
| [XDR viewer](https://lab.stellar.org/xdr/view) | Decode the signed auth entry or transaction inside a `PAYMENT-SIGNATURE` header, to show judges what Mhasibu signed |
| [Contract explorer](https://lab.stellar.org/smart-contracts/contract-explorer) and [Deploy](https://lab.stellar.org/smart-contracts/deploy-contract) | Phase 2: deploy the purse contract and call `buy` from the browser |
| [Submit](https://lab.stellar.org/transaction/submit) | Send a signed transaction |

Always pick **Testnet** in Lab's network menu. Our `npm run setup` (services/gateway) already funds wallets with Friendbot and adds the USDC trustline, so Lab is the manual fallback. Links checked 14 Nov: `/transaction-dashboard` and `/transaction/simulate` now redirect, so we use `/transaction/dashboard` and `/transaction/build`.

### Are we following the Stellar docs?

Checked against Stellar Lab's docs, the networks page, the x402 page, the lumens (reserves) page and the `stellar/x402-stellar` repo.

| Stellar docs say | What CarePurse does | OK? |
|---|---|---|
| Testnet id `stellar:testnet`, passphrase `Test SDF Network ; September 2015`, Horizon `horizon-testnet.stellar.org`, RPC `soroban-testnet.stellar.org` | Same values in `.env.example`; the gateway refuses to start on any other network | Yes |
| x402 pays with signed Soroban auth entries for a SEP-41 token; USDC is the default | Mhasibu signs auth entries (`ExactStellarScheme`) for the USDC contract `CBIELTK6…` | Yes |
| Testnet USDC issuer `GBBD47IF…` and contract `CBIELTK6…`, 7 decimals | Same values; prices are worked out in base units with 7 decimals | Yes |
| Scheme `exact` | `exact` | Yes |
| Coinbase facilitator: testnet, sponsored fees. Built on Stellar: testnet and mainnet, needs a key | Coinbase as our working default, Built on Stellar as the switchable alternative | Yes |
| Classic accounts pay their own reserves: 1 XLM minimum plus 0.5 XLM per trustline | Each wallet gets 10,000 test XLM from Friendbot, then a USDC trustline | Yes |
| The receiver of an issued asset needs a trustline | The gateway wallet and every agent wallet get a USDC trustline in `npm run setup` | Yes |
| Testnet resets 2 to 4 times a year and wipes all accounts; build scripts that repopulate | `npm run setup` keeps our keys, re-funds missing wallets and re-adds trustlines; `npm run get-usdc` refills USDC | Yes |
| The docs name an npm package `x402-stellar` | We use the `@x402/*` 2.30.0 packages from the workshop kit, which we've run live. `stellar/x402-stellar` itself names no published package | Fine, keep the kit's |
| Mainnet RPC only through third-party providers | Not relevant: testnet only | n/a |


### Watch out

1. **Testnet reset on 16 December 2026, 17:00 UTC** (the only one scheduled for 2026). That's after submissions close on 28 November. If Demo Day falls on or after it, every wallet, balance and demo transaction link disappears. Before Demo Day: run `npm run setup` and `npm run get-usdc` again, make fresh demo payments, and don't put old explorer links in the slides.
2. **Friendbot is rate limited.** Fund wallets once and reuse them; don't call it on every test run.
3. **Phase 2 (purse contract):** use Lab to deploy it and test `buy` before wiring it into Mhasibu.
4. **Production, later:** wallets for many purses would need sponsored reserves, so the daughter doesn't hold XLM. See the Sponsored Reserves guide in the Stellar docs.


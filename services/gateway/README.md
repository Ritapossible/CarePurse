# CarePurse gateway

The x402 seller. It sells electricity, airtime and data top-ups for USDC on **Stellar testnet**, one payment per top-up. Fulfilment is a **sandbox**: tokens are demo tokens, never sent to a real meter or phone.

> Live Stellar Testnet payment · sandbox utility fulfilment

## Run it

Needs Node.js 22+.

```bash
cd services/gateway
npm install
npm run setup        # creates .env at the repo root + two funded testnet wallets
npm run get-usdc     # gives the agent wallet 5 test USDC (or use faucet.circle.com)
npm start            # gateway on http://localhost:4021
```

In a second terminal:

```bash
npm run peek                          # see a 402, pay nothing
npm run pay                           # electricity ₦5,000, paid over x402
npm run pay electricity 500           # the electricity minimum
npm run pay airtime 100 08031234567   # the airtime minimum
npm test                              # offline tests, no money moves
```

`npm run pay` plays Mhasibu's part. A successful run prints the token and a Stellar testnet transaction link.

## API

| Method | Path | Paid? | What it does |
|---|---|---|---|
| GET | `/v1/options?utility=airtime&max_ngn=500` | free | Sizes and prices, optionally only up to `max_ngn` |
| GET | `/v1/meters/:meter` | free | The meter's owner name, so the daughter can confirm it |
| POST | `/v1/orders` `{utility, ngn, destination}` | free | Creates an order; returns `payPath` |
| GET | `/v1/orders/:id` | free | Order status and transaction link |
| GET | `/paid/topup/:utility/:ngn?order=<id>` | **x402** | 402 until paid, then the token |

**Sizes:**
- **Electricity:** ₦500, ₦1,000, ₦2,000, ₦5,000, ₦10,000. The destination is a meter number (11 to 13 digits).
- **Airtime and data:** ₦100, ₦200, ₦500, ₦1,000, ₦2,000, ₦5,000. The destination is a Nigerian phone number.
- **Price:** the naira amount ÷ `NGN_PER_USDC`, in USDC base units (7 decimals), rounded up.

## How a paid request works

1. **Check first.** Before asking for money, the gateway checks the order: it must exist, match the route, not be paid or expired. A bad order gets a 4xx, never a 402.
2. **402.** The x402 middleware answers `402` with a `PAYMENT-REQUIRED` header: amount, USDC contract, `stellar:testnet`, our address.
3. **Retry.** The payer signs a Soroban USDC transfer and retries with `PAYMENT-SIGNATURE`. The facilitator verifies it.
4. **Fulfil.** Our handler moves the order to `fulfilling` (only once, ever) and gets the token from the provider.
5. **Settle.** The facilitator settles the USDC on Stellar. The response carries `PAYMENT-RESPONSE` with the transaction hash.
6. **Record.** The order becomes `delivered`, and the transaction hash is stored so it can't settle another order. If the handler fails, the middleware cancels settlement and nobody pays.

**Fail closed:** without a valid `GATEWAY_RECIPIENT`, every paid route returns 503.

## Files

| File | What it is |
|---|---|
| `src/server.mjs` | The gateway: free routes, the order check, the x402 middleware, the paid handler |
| `src/catalog.mjs` | Utilities, sizes, exact USDC prices, the paid route table |
| `src/store.mjs` | Orders in a JSON file (`.data/orders.json`), with conditional status changes |
| `src/provider.mjs` | The sandbox utility provider (mock). A real biller plugs in behind the same two functions. |
| `src/config.mjs` | Reads the root `.env`. Refuses anything but testnet. |
| `scripts/setup.mjs` | Creates and funds the gateway and agent wallets, with USDC trustlines |
| `scripts/get-test-usdc.mjs` | Swaps test XLM for test USDC on the testnet exchange |
| `scripts/peek.mjs` / `scripts/pay.mjs` | See a 402 / pay one |
| `test/gateway.test.mjs` | Offline tests with a fake facilitator |

Patterns follow Koxy's workshop kit (`library.md`, section 5).

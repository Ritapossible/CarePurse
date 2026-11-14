# Deploying CarePurse to Render

Stellar **testnet** and the VTpass **sandbox** only. Three services from one Blueprint (`render.yaml`):

| Service | Folder | What it is |
|---|---|---|
| `carepurse-gateway` | `services/gateway` | The x402 seller. Fulfils through the VTpass sandbox |
| `carepurse-mhasibu` | `packages/mhasibu` | The agent. Holds the agent wallet, asks the purse contract, pays over x402 |
| `carepurse-web` | `apps/web` | Mama's chat (`/chat`) and the demo view with the live log (`/demo`) |

## Before you start

1. **VTpass sandbox keys:** sign up at https://sandbox.vtpass.com, then Account → API Keys. Copy the **api-key**, **public-key** and **secret-key** (the last two are shown once).
2. **Wallet values** from our local `.env` (ask Rita; never paste them in chat or commit them): `GATEWAY_RECIPIENT` (public address) and `AGENT_SECRET_KEY` (Mhasibu's testnet secret).
3. **OpenServ key** for Claude (optional; without it Mhasibu uses the keyword parser).

## Steps

1. Render dashboard → **New → Blueprint** → connect GitHub → pick `Ritapossible/CarePurse` → it reads `render.yaml`.
2. Fill in the `sync: false` values it asks for. Use placeholders for the URLs on the first pass; Render shows each service's URL (`https://carepurse-gateway-xxxx.onrender.com`) once created.
3. Then set, and redeploy:
   - gateway `GATEWAY_URL` = the gateway's own URL
   - mhasibu `GATEWAY_URL` = the gateway's URL; `WEB_ORIGIN` = the web app's URL
   - web `NEXT_PUBLIC_MHASIBU_URL` = Mhasibu's URL (read at **build** time, so redeploy the web service after setting it)
4. Check: open `https://<gateway>/health`, `https://<mhasibu>/v1/status`, then `https://<web>/demo` and send "Abeg, light don almost finish", then "1".

## Keep it awake (UptimeRobot)

Add three HTTP(s) monitors, every 5 minutes: the gateway's `/health`, Mhasibu's `/v1/status` and the web app's `/`. Pause them while we build and switch them on for judging and Demo Day: Render's free plan has **750 hours a month for the whole account**, and three services awake 24/7 use them up in about 10 days (then Render suspends all free services until next month). See the README, "Hosting and keeping it awake".

## Things to know

- **Free plan sleeps** after 15 minutes idle; the first request takes about a minute. Open all three URLs a few minutes before a demo.
- **Files are wiped on restart** (`.data/orders.json`, `.data/purses.json`). The demo purse is re-seeded; the code-side spend history resets, but **the purse contract's caps and spends stay on-chain**. Moving these files to a database is in `PLAN.md`, Step 6.
- **No secrets in `render.yaml`.** The gateway only needs its public address; only Mhasibu holds a secret key.
- **Testnet resets on 16 Dec 2026:** run `npm run setup`, `npm run get-usdc` and `npm run deploy-purse` locally again, then update `PURSE_CONTRACT_ID` on Render.

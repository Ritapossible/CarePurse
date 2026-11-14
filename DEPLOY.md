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

## The database (do this first)

1. Sign up at **https://neon.tech** (free; GitHub login works) and create a project, for example `carepurse`, region close to Render's (Frankfurt or US East).
2. Copy the **connection string** (it looks like `postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`).
3. Paste it as `DATABASE_URL` for **carepurse-gateway** and **carepurse-mhasibu** in Render. Nothing else to set up: the table is created on first start.

Why Neon: Render's free Postgres is deleted after 30 days (mid-December, around Demo Day); Supabase's free tier pauses after a week without use.

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
- **Set `DATABASE_URL`** on the gateway and on Mhasibu (the same database is fine). Render's free plan wipes files on every restart; with the database, orders, purchases, Mama's tokens and her chat survive. Without it they'd reset after each restart.
- **No secrets in `render.yaml`.** The gateway only needs its public address; only Mhasibu holds a secret key.
- **Testnet resets on 16 Dec 2026:** run `npm run setup`, `npm run get-usdc` and `npm run deploy-purse` locally again, then update `PURSE_CONTRACT_ID` on Render.

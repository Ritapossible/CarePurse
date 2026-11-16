# CarePurse web

Next.js 16. The landing page (`/`), Mama's chat (`/chat`) and the judges' demo with the live Agent & x402 Log (`/demo`).

The browser only talks to this app. `src/app/api/mhasibu/[...path]/route.ts` relays an allowlist of routes to the Mhasibu API and adds its key on the server, so the key never reaches a browser. Mama's chat needs the access code (`?code=…` once; it is remembered on the device).

```bash
npm install
npm run dev      # http://localhost:3000, with Mhasibu on http://localhost:4022
npm run build    # what Vercel runs
```

Deploy: see "Web app on Vercel" in [`DEPLOY.md`](../../DEPLOY.md). Settings: [`.env.example`](.env.example).

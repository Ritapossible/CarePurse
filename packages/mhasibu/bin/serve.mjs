// Mhasibu's API for the web app. Holds the agent wallet's key, so it runs server-side only.
//   POST /v1/chat            { purse, text } → { reply }
//   GET  /v1/history?purse=  Mama's chat so far
//   GET  /v1/tokens?purse=   her electricity tokens, newest first
//   GET  /v1/events?purse=   live Agent & x402 Log (Server-Sent Events)
//   GET  /v1/status          phase, understander, contract and wallet addresses (public keys only)
//   POST /v1/demo/overspend  { usdc } demo only (DEMO_MODE=1): bypass Mhasibu's code checks and ask
//                            the purse contract for more than the cap, to show the on-chain refusal
// npm run serve   (port MHASIBU_PORT, default 4022)
import http from "node:http";
import { Keypair } from "@stellar/stellar-sdk";
import { config, explorer } from "../src/config.mjs";
import { createMhasibu } from "../src/mhasibu.mjs";
import { openPurseStore } from "../src/purses.mjs";
import { ContractRefused, buyArgs, createSoroban } from "../src/purse-contract.mjs";

const port = Number(process.env.PORT) || Number(process.env.MHASIBU_PORT ?? 4022); // Render sets PORT
const allowOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const demoMode = process.env.DEMO_MODE === "1";
const clients = new Set();
const recent = [];

function emit(event) {
  const e = { at: new Date().toISOString(), ...event };
  if (e.tx) e.link = explorer.tx(e.tx);
  recent.push(e);
  if (recent.length > 200) recent.shift();
  const line = `data: ${JSON.stringify(e)}\n\n`;
  for (const res of clients) res.write(line);
}

const purses = await openPurseStore({ file: config.pursesFile, databaseUrl: config.databaseUrl });
console.log(config.databaseUrl ? "Purses: Postgres (DATABASE_URL)" : `Purses: ${config.pursesFile} (set DATABASE_URL to keep them across restarts)`);
const mhasibu = createMhasibu({ purses, log: emit });
const agentAddress = Keypair.fromSecret(config.agentSecret).publicKey();

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": allowOrigin });
  res.end(JSON.stringify(body));
};
const readJson = (req) => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", (c) => { data += c; if (data.length > 10_000) req.destroy(); });
  req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { reject(new Error("bad json")); } });
});

let busy = Promise.resolve(); // one message at a time, so two taps can't race a payment

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": allowOrigin, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" });
    return res.end();
  }
  try {
    if (req.method === "GET" && url.pathname === "/v1/status") {
      return send(res, 200, {
        phase: config.purseContractId ? 2 : 1,
        understander: mhasibu.understander,
        network: config.network,
        purseContract: config.purseContractId || null,
        purseContractLink: config.purseContractId ? `${config.explorerUrl}/contract/${config.purseContractId}` : null,
        agent: agentAddress,
        gateway: config.gatewayUrl,
        demoMode,
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/history") {
      const purse = purses.get(url.searchParams.get("purse") ?? "demo");
      if (!purse) return send(res, 404, { error: "no such purse" });
      return send(res, 200, { mama: { name: purse.mama.name, language: purse.mama.language }, guardian: purse.guardian.name, history: purse.history.slice(-50) });
    }
    // Mama's electricity tokens, newest first: the chat pins the latest one so it never scrolls away.
    if (req.method === "GET" && url.pathname === "/v1/tokens") {
      const purse = purses.get(url.searchParams.get("purse") ?? "demo");
      if (!purse) return send(res, 404, { error: "no such purse" });
      const tokens = purse.spends.filter((s) => s.utility === "electricity" && s.token).reverse().slice(0, 10)
        .map((s) => ({ at: s.at, ngn: s.ngn, token: s.token, units: s.units ?? null, meter: purse.destinations.electricity }));
      return send(res, 200, { tokens });
    }
    if (req.method === "GET" && url.pathname === "/v1/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": allowOrigin });
      res.write(": connected\n\n");
      clients.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/chat") {
      const { purse = "demo", text } = await readJson(req);
      if (typeof text !== "string" || !text.trim()) return send(res, 400, { error: "text is required" });
      const run = busy.then(() => mhasibu.handle(purse, text.trim().slice(0, 500)));
      busy = run.catch(() => {});
      return send(res, 200, { reply: await run });
    }
    if (req.method === "POST" && url.pathname === "/v1/demo/overspend") {
      if (!demoMode) return send(res, 404, { error: "demo mode is off" });
      if (!config.purseContractId) return send(res, 409, { error: "no purse contract deployed" });
      const { usdc = 7 } = await readJson(req);
      const amount = BigInt(Math.round(Math.min(Number(usdc) || 7, 1000) * 10 ** config.usdc.decimals));
      const purse = purses.get("demo");
      emit({ type: "attack", usdc: Number(amount) / 1e7, text: `Bypassing Mhasibu's own rule checks: asking the purse contract for ${Number(amount) / 1e7} USDC of electricity` });
      try {
        const r = await createSoroban({ rpcUrl: config.rpcUrl }).invoke(Keypair.fromSecret(config.agentSecret), config.purseContractId, "buy",
          buyArgs({ utility: "electricity", destination: purse.destinations.electricity, amount, orderId: `overspend-${Date.now()}` }));
        emit({ type: "contract-ok", tx: r.hash, text: "The contract allowed it" });
        return send(res, 200, { refused: false, tx: r.hash });
      } catch (err) {
        if (!(err instanceof ContractRefused)) throw err;
        emit({ type: "contract-refused", rule: err.rule, code: err.code });
        return send(res, 200, { refused: true, rule: err.rule, code: err.code });
      }
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    emit({ type: "error", message: err.message });
    send(res, 500, { error: "Mhasibu could not finish that. Try again." });
  }
});

server.listen(port, () => console.log(`Mhasibu API on http://localhost:${port} · ${mhasibu.understander} · phase ${config.purseContractId ? 2 : 1}${demoMode ? " · demo mode" : ""}`));

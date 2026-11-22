// The Mhasibu API (packages/mhasibu, npm run serve) holds the agent wallet, so it is a separate
// server. The browser talks only to this web app's relay (/api/mhasibu/...), which adds the API key
// on the server side. A demo link's ?code=… is read once and taken out of the address bar; the relay
// then remembers it in an httpOnly cookie (scripts can't read it). It is never stored in the browser
// (no localStorage): only kept in this page's memory until the cookie is set.
export const MHASIBU_URL = "/api/mhasibu";

let memoryCode = "";
function accessCode(): string {
  if (typeof window === "undefined") return "";
  try { localStorage.removeItem("carepurse-code"); } catch { /* older builds stored it there: forget it */ }
  const url = new URL(window.location.href);
  const fromLink = url.searchParams.get("code");
  if (fromLink) {
    memoryCode = fromLink;
    url.searchParams.delete("code");
    window.history.replaceState(window.history.state, "", url.toString());
  }
  return memoryCode;
}
// For someone who opened a page without the full link: send the code they typed once (the relay
// sets its cookie), then reload.
export async function saveAccessCode(code: string) {
  memoryCode = code.trim();
  await fetch(`${MHASIBU_URL}/v1/history`, { headers: { "x-access-code": memoryCode } }).catch(() => {});
  window.location.reload();
}
const withCode = (headers: Record<string, string> = {}) => ({ ...headers, "x-access-code": accessCode() });
// EventSource can't send headers: the live log relies on the relay's cookie (set by the first call
// that carried the code, see AgentLog), never on a code in its URL.
export const eventsUrl = () => `${MHASIBU_URL}/v1/events`;

export type ChatLine = { from: "mama" | "mhasibu"; text: string; at?: string; cid?: string };

export type LogEvent = {
  at: string;
  type: string;
  text?: string;
  intent?: string;
  utility?: string | null;
  choice?: number | null;
  by?: string;
  seconds?: number; // pay-hold: how long until an earlier signed payment expires // "model", or "scripted: <why>" when the keyword parser answered
  ngn?: number;
  feeNgn?: number;
  chargedNgn?: number;
  amount?: string;
  payTo?: string;
  asset?: string;
  network?: string;
  url?: string;
  id?: string;
  payPath?: string;
  rule?: string;
  reason?: string;
  code?: number;
  kind?: string;
  tx?: string;
  link?: string;
  message?: string;
  usdc?: number;
};

export type Status = {
  phase: 1 | 2;
  understander: string;
  network: string;
  purseContract: string | null;
  purseContractLink: string | null;
  agent: string;
  gateway: string;
  demoMode: boolean;
};

// A top-up can take 10 to 30 seconds. After a minute (or a server error) the reply may still come:
// the chat then reads it from her history instead (see Chat). `retryable` marks those cases.
export class ChatError extends Error {
  constructor(message: string, public retryable: boolean) { super(message); }
}
export async function sendMessage(text: string, purse = "demo", cid?: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${MHASIBU_URL}/v1/chat`, {
      method: "POST",
      headers: withCode({ "content-type": "application/json" }),
      body: JSON.stringify({ purse, text, cid }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ChatError("no answer yet", true); // timed out or the connection dropped
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ChatError(body.error ?? "Mhasibu could not answer", res.status >= 500);
  return body.reply;
}

// She copied this token: remembered on the server, for all her phones.
export async function markTokenCopied(record: TokenRecord, purse = "demo") {
  await fetch(`${MHASIBU_URL}/v1/tokens/seen`, { method: "POST", headers: withCode({ "content-type": "application/json" }), body: JSON.stringify({ purse, at: record.at, token: record.token }) }).catch(() => {});
}

export async function loadHistory(purse = "demo") {
  const res = await fetch(`${MHASIBU_URL}/v1/history?purse=${purse}`, { headers: withCode() });
  if (res.status === 401) throw new Error("access code needed");
  if (!res.ok) throw new Error("could not load the chat");
  // `pending`: ids of her messages that reached Mhasibu and are still waiting or being handled.
  return (await res.json()) as { mama: { name: string; language: string }; guardian: string; history: ChatLine[]; pending?: string[] };
}

export type TokenRecord = { at: string; ngn: number; token: string; units: string | null; meter: string; copied?: boolean };

export async function loadTokens(purse = "demo"): Promise<TokenRecord[]> {
  const res = await fetch(`${MHASIBU_URL}/v1/tokens?purse=${purse}`, { headers: withCode() });
  if (!res.ok) return [];
  return (await res.json()).tokens;
}

// Mama's purchases for her Purchases page, newest first. Face value only (no service fee).
export type Purchase = {
  at: string;
  utility: "electricity" | "airtime" | "data";
  ngn: number;
  to: string;
  token: string | null;
  units: string | null;
  status: "done" | "checking";
  link: string | null;
};

export async function loadPurchases(purse = "demo"): Promise<{ mama: { name: string }; purchases: Purchase[] }> {
  const res = await fetch(`${MHASIBU_URL}/v1/purchases?purse=${purse}`, { headers: withCode() });
  if (res.status === 401) throw new Error("access code needed");
  if (!res.ok) throw new Error("could not load purchases");
  return res.json();
}

export async function loadStatus(): Promise<Status> {
  const res = await fetch(`${MHASIBU_URL}/v1/status`);
  return res.json();
}

// The amount is fixed by the server (just over Adaeze's on-chain cap), never chosen here.
export async function tryOverspend() {
  const res = await fetch(`${MHASIBU_URL}/v1/demo/overspend`, { method: "POST", headers: withCode({ "content-type": "application/json" }), body: "{}" });
  return res.json();
}

// The unsaved meter and amount are fixed by the server, never chosen here.
export async function tryWrongDestination() {
  const res = await fetch(`${MHASIBU_URL}/v1/demo/wrong-destination`, { method: "POST", headers: withCode({ "content-type": "application/json" }), body: "{}" });
  return res.json();
}

export const usdc = (baseUnits?: string) => (baseUnits ? (Number(baseUnits) / 1e7).toFixed(7).replace(/0+$/, "").replace(/\.$/, "") : "");
export const short = (s?: string) => (s && s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s ?? "");

// The Mhasibu API (packages/mhasibu, npm run serve) holds the agent wallet, so it is a separate
// server. The browser talks only to this web app's relay (/api/mhasibu/...), which adds the API key
// on the server side. If the demo link has ?code=…, it is kept and sent with every call.
export const MHASIBU_URL = "/api/mhasibu";

function accessCode(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromLink = new URLSearchParams(window.location.search).get("code");
    if (fromLink) localStorage.setItem("carepurse-code", fromLink);
    return fromLink ?? localStorage.getItem("carepurse-code") ?? "";
  } catch {
    return new URLSearchParams(window.location.search).get("code") ?? "";
  }
}
const withCode = (headers: Record<string, string> = {}) => ({ ...headers, "x-access-code": accessCode() });
// EventSource can't send headers, so the live log carries the code in its URL.
export const eventsUrl = () => `${MHASIBU_URL}/v1/events?code=${encodeURIComponent(accessCode())}`;

export type ChatLine = { from: "mama" | "mhasibu"; text: string; at?: string };

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

export async function sendMessage(text: string, purse = "demo"): Promise<string> {
  const res = await fetch(`${MHASIBU_URL}/v1/chat`, {
    method: "POST",
    headers: withCode({ "content-type": "application/json" }),
    body: JSON.stringify({ purse, text }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Mhasibu could not answer");
  return body.reply;
}

export async function loadHistory(purse = "demo") {
  const res = await fetch(`${MHASIBU_URL}/v1/history?purse=${purse}`, { headers: withCode() });
  if (res.status === 401) throw new Error("access code needed");
  if (!res.ok) throw new Error("could not load the chat");
  return (await res.json()) as { mama: { name: string; language: string }; guardian: string; history: ChatLine[] };
}

export type TokenRecord = { at: string; ngn: number; token: string; units: string | null; meter: string };

export async function loadTokens(purse = "demo"): Promise<TokenRecord[]> {
  const res = await fetch(`${MHASIBU_URL}/v1/tokens?purse=${purse}`, { headers: withCode() });
  if (!res.ok) return [];
  return (await res.json()).tokens;
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

export const usdc = (baseUnits?: string) => (baseUnits ? (Number(baseUnits) / 1e7).toFixed(7).replace(/0+$/, "").replace(/\.$/, "") : "");
export const short = (s?: string) => (s && s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s ?? "");

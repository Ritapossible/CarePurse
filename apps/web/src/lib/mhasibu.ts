// The Mhasibu API (packages/mhasibu, npm run serve). It holds the agent wallet, so it is a
// separate server; the browser only sends Mama's text and reads replies and log events.
export const MHASIBU_URL = process.env.NEXT_PUBLIC_MHASIBU_URL ?? "http://localhost:4022";

export type ChatLine = { from: "mama" | "mhasibu"; text: string; at?: string };

export type LogEvent = {
  at: string;
  type: string;
  text?: string;
  intent?: string;
  utility?: string | null;
  choice?: number | null;
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purse, text }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Mhasibu could not answer");
  return body.reply;
}

export async function loadHistory(purse = "demo") {
  const res = await fetch(`${MHASIBU_URL}/v1/history?purse=${purse}`);
  if (!res.ok) throw new Error("could not load the chat");
  return (await res.json()) as { mama: { name: string; language: string }; guardian: string; history: ChatLine[] };
}

export type TokenRecord = { at: string; ngn: number; token: string; units: string | null; meter: string };

export async function loadTokens(purse = "demo"): Promise<TokenRecord[]> {
  const res = await fetch(`${MHASIBU_URL}/v1/tokens?purse=${purse}`);
  if (!res.ok) return [];
  return (await res.json()).tokens;
}

export async function loadStatus(): Promise<Status> {
  const res = await fetch(`${MHASIBU_URL}/v1/status`);
  return res.json();
}

export async function tryOverspend(usdc: number) {
  const res = await fetch(`${MHASIBU_URL}/v1/demo/overspend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usdc }),
  });
  return res.json();
}

export const usdc = (baseUnits?: string) => (baseUnits ? (Number(baseUnits) / 1e7).toFixed(7).replace(/0+$/, "").replace(/\.$/, "") : "");
export const short = (s?: string) => (s && s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s ?? "");

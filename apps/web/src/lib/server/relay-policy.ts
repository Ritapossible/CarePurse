// What the Mama relay (/api/mhasibu) allows, as plain functions, so they can be tested without a
// server. The route only gathers the inputs (cookies, headers) and applies the answer.
//   - Mama signed in (her session): her own purse, nothing else, never the demo buttons.
//   - The demo (WEB_ACCESS_CODE, from the page or the demo cookie): the demo purse only.
//   - No access code set in production: the demo is closed (Mhasibu's key is never anonymous).

export const DEMO_ONLY = new Set(["POST v1/demo/overspend", "POST v1/demo/wrong-destination"]);
export const ALLOWED = new Set(["GET v1/status", "GET v1/history", "GET v1/tokens", "GET v1/purchases", "GET v1/events", "POST v1/chat", "POST v1/tokens/seen", ...DEMO_ONLY]);
export const PER_PURSE = new Set(["GET v1/history", "GET v1/tokens", "GET v1/purchases", "GET v1/events", "POST v1/chat", "POST v1/tokens/seen"]);

export type Decision = { ok: true; purse: string | null } | { ok: false; status: number; error: string };

export function decide(input: {
  route: string;
  mamaPurse: string | null; // from her session cookie, resolved by Mhasibu
  codeOk: boolean; // the access code (offered or remembered) matches WEB_ACCESS_CODE
  accessCodeSet: boolean;
  production: boolean;
}): Decision {
  const { route, mamaPurse, codeOk, accessCodeSet, production } = input;
  if (!ALLOWED.has(route)) return { ok: false, status: 404, error: "not found" };
  if (route === "GET v1/status") return { ok: true, purse: null };
  if (mamaPurse && !DEMO_ONLY.has(route)) return { ok: true, purse: mamaPurse };
  if (!accessCodeSet && production) return { ok: false, status: 503, error: "WEB_ACCESS_CODE is not set on the web app, so the demo is closed." };
  if (accessCodeSet && !codeOk) return { ok: false, status: 401, error: "access code needed" };
  return { ok: true, purse: "demo" };
}

// The upstream query and body: the purse is always the one decided here, never the browser's.
export function pin(route: string, purse: string | null, query: URLSearchParams, json: Record<string, unknown> | null) {
  const out = new URLSearchParams();
  query.forEach((v, k) => { if (k !== "code" && k !== "purse") out.set(k, v); });
  const method = route.split(" ")[0];
  if (purse && PER_PURSE.has(route) && method === "GET") out.set("purse", purse);
  const body = method === "POST" ? JSON.stringify(PER_PURSE.has(route) ? { ...(json ?? {}), purse } : (json ?? {})) : undefined;
  return { query: out, body };
}

// Sign-up: the guardian address must be one of her own Privy Stellar wallets.
export function guardianCheck(account: { wallets: string[] } | null, address: unknown): Decision {
  if (!account) return { ok: false, status: 502, error: "We couldn’t confirm your wallet with Privy. Please try again." };
  if (!account.wallets.includes(String(address ?? ""))) return { ok: false, status: 403, error: "That wallet isn’t the CarePurse wallet on your account. Please reload and try again." };
  return { ok: true, purse: null };
}

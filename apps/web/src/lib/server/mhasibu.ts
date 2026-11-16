// Server-side calls to the Mhasibu API. Its key (MHASIBU_API_KEY) stays on this server.
import "server-only";

export const UPSTREAM = (process.env.MHASIBU_URL ?? "http://localhost:4022").replace(/\/$/, "");
const KEY = process.env.MHASIBU_API_KEY ?? "";

export function mhasibuFetch(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}) {
  return fetch(`${UPSTREAM}${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: init.signal,
  });
}

// Pass Mhasibu's answer (status and JSON) straight back to the browser.
export async function passThrough(res: Response) {
  const body = await res.json().catch(() => ({ error: "Mhasibu is not reachable right now." }));
  return Response.json(body, { status: res.status });
}

// Which purse a Mama session belongs to (null if none).
export async function purseForSession(session: string | undefined): Promise<string | null> {
  if (!session) return null;
  const res = await mhasibuFetch("/v1/sessions/resolve", { method: "POST", body: { session } });
  if (!res.ok) return null;
  return ((await res.json()) as { purseId: string | null }).purseId;
}

export const MAMA_COOKIE = "cp_mama";

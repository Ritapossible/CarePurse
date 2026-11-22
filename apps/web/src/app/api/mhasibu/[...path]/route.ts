// Server-side relay to the Mhasibu API. The key (MHASIBU_API_KEY) lives only here, on the web
// app's server: browsers never see it. Only the routes the pages use are relayed.
//
// Which purse a request may touch is decided here, never by the browser:
//   - Mama signed in (her session cookie from the invite): her own purse, nothing else.
//   - The demo link (?code=WEB_ACCESS_CODE): the demo purse only.
// WEB_ACCESS_CODE is required in production for the demo: without it the demo routes are closed.
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { MAMA_COOKIE, UPSTREAM, purseForSession } from "@/lib/server/mhasibu";

const KEY = process.env.MHASIBU_API_KEY ?? "";
const ACCESS_CODE = process.env.WEB_ACCESS_CODE ?? "";
const DEMO_COOKIE = "cp_demo";
const DEMO_ONLY = new Set(["POST v1/demo/overspend", "POST v1/demo/wrong-destination"]);
const ALLOWED = new Set(["GET v1/status", "GET v1/history", "GET v1/tokens", "GET v1/purchases", "GET v1/events", "POST v1/chat", "POST v1/tokens/seen", ...DEMO_ONLY]);
const PER_PURSE = new Set(["GET v1/history", "GET v1/tokens", "GET v1/purchases", "GET v1/events", "POST v1/chat", "POST v1/tokens/seen"]);

function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function relay(request: Request, path: string[]) {
  const route = `${request.method} ${path.join("/")}`;
  if (!ALLOWED.has(route)) return Response.json({ error: "not found" }, { status: 404 });
  const url = new URL(request.url);

  // The demo's access code: from the page (a header, once from the link) or this browser's cookie.
  const jar = await cookies();
  const offered = request.headers.get("x-access-code") || url.searchParams.get("code") || "";
  const remembered = jar.get(DEMO_COOKIE)?.value ?? "";
  const codeOk = (c: string) => Boolean(ACCESS_CODE && c && sameText(c, ACCESS_CODE));
  // A correct code is remembered in an httpOnly cookie, so the live log never needs it in a URL.
  if (codeOk(offered) && offered !== remembered) {
    jar.set(DEMO_COOKIE, offered, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/mhasibu", maxAge: 7 * 86_400 });
  }

  // Who is asking: Mama (her session) or the demo (the access code).
  let purse: string | null = null;
  if (route !== "GET v1/status") {
    const mama = await purseForSession(jar.get(MAMA_COOKIE)?.value);
    if (mama && !DEMO_ONLY.has(route)) {
      purse = mama;
    } else {
      // Fail closed: a public (production) site with no access code would hand Mhasibu's key to anyone.
      if (!ACCESS_CODE && process.env.NODE_ENV === "production") {
        return Response.json({ error: "WEB_ACCESS_CODE is not set on the web app, so the demo is closed." }, { status: 503 });
      }
      if (ACCESS_CODE && !codeOk(offered) && !codeOk(remembered)) return Response.json({ error: "access code needed" }, { status: 401 });
      purse = "demo";
    }
  }

  const target = new URL(`${UPSTREAM}/${path.join("/")}`);
  url.searchParams.forEach((v, k) => { if (k !== "code" && k !== "purse") target.searchParams.set(k, v); });
  if (purse && PER_PURSE.has(route) && request.method === "GET") target.searchParams.set("purse", purse);
  let body: string | undefined;
  if (request.method === "POST") {
    const json = await request.json().catch(() => ({}));
    body = JSON.stringify(PER_PURSE.has(route) ? { ...json, purse } : json);
  }
  const upstream = await fetch(target, {
    method: request.method,
    headers: { "content-type": "application/json", ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
    body,
    cache: "no-store",
    signal: request.signal,
  });
  // Stream the body through as-is (the live log is Server-Sent Events).
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

// The live log is a long-lived stream (Server-Sent Events). On Vercel a function stops at its max
// duration; the browser's EventSource then reconnects by itself.
export const maxDuration = 300;

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, { params }: Ctx) {
  return relay(request, (await params).path);
}
export async function POST(request: Request, { params }: Ctx) {
  return relay(request, (await params).path);
}

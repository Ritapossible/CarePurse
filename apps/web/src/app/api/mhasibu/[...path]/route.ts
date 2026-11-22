// Server-side relay to the Mhasibu API. The key (MHASIBU_API_KEY) lives only here, on the web
// app's server: browsers never see it. Only the routes the pages use are relayed.
//
// Which purse a request may touch is decided here, never by the browser:
//   - Mama signed in (her session cookie from the invite): her own purse, nothing else.
//   - The demo link (?code=WEB_ACCESS_CODE): the demo purse only.
// WEB_ACCESS_CODE is required in production for the demo: without it the demo routes are closed.
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { MAMA_COOKIE, UPSTREAM, purseForSession } from "@/lib/server/mhasibu";
import { decide, pin } from "@/lib/server/relay-policy";

const KEY = process.env.MHASIBU_API_KEY ?? "";
const ACCESS_CODE = process.env.WEB_ACCESS_CODE ?? "";
const DEMO_COOKIE = "cp_demo";

function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function relay(request: Request, path: string[]) {
  const route = `${request.method} ${path.join("/")}`;
  const url = new URL(request.url);

  // The demo's access code: from the page (a header, once from the link) or this browser's cookie.
  const jar = await cookies();
  const offered = request.headers.get("x-access-code") || url.searchParams.get("code") || "";
  const remembered = jar.get(DEMO_COOKIE)?.value ?? "";
  const codeOk = (c: string) => Boolean(ACCESS_CODE && c && sameText(c, ACCESS_CODE));

  const decision = decide({
    route,
    mamaPurse: route === "GET v1/status" ? null : await purseForSession(jar.get(MAMA_COOKIE)?.value),
    codeOk: codeOk(offered) || codeOk(remembered),
    accessCodeSet: Boolean(ACCESS_CODE),
    production: process.env.NODE_ENV === "production",
  });
  if (!decision.ok) return Response.json({ error: decision.error }, { status: decision.status });
  // A correct code is remembered in an httpOnly cookie, so the live log never needs it in a URL.
  if (codeOk(offered) && offered !== remembered) {
    jar.set(DEMO_COOKIE, offered, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/mhasibu", maxAge: 7 * 86_400 });
  }

  const json = request.method === "POST" ? await request.json().catch(() => ({})) : null;
  const { query, body } = pin(route, decision.purse, url.searchParams, json);
  const target = new URL(`${UPSTREAM}/${path.join("/")}`);
  target.search = query.toString();
  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      "content-type": "application/json",
      ...(KEY ? { authorization: `Bearer ${KEY}` } : {}),
      // A short hash of the visitor's address (never the address itself), for per-visitor limits on the demo.
      "x-carepurse-visitor": createHash("sha256").update(`cp-visitor:${(request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()}`).digest("hex").slice(0, 16),
    },
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

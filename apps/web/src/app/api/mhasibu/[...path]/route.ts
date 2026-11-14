// Server-side relay to the Mhasibu API. The key (MHASIBU_API_KEY) lives only here, on the web
// app's server: browsers never see it. Only the routes the pages use are relayed.
// WEB_ACCESS_CODE: the demo link must carry ?code=…; the pages send it back on each call. Required in
// production: without it the private routes are closed (otherwise any visitor would get the key's power).
import { timingSafeEqual } from "node:crypto";

const UPSTREAM = (process.env.MHASIBU_URL ?? "http://localhost:4022").replace(/\/$/, "");
const KEY = process.env.MHASIBU_API_KEY ?? "";
const ACCESS_CODE = process.env.WEB_ACCESS_CODE ?? "";
const ALLOWED = new Set(["GET v1/status", "GET v1/history", "GET v1/tokens", "GET v1/events", "POST v1/chat", "POST v1/demo/overspend"]);

function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function relay(request: Request, path: string[]) {
  const route = `${request.method} ${path.join("/")}`;
  if (!ALLOWED.has(route)) return Response.json({ error: "not found" }, { status: 404 });
  const url = new URL(request.url);
  // Fail closed: a public (production) site with no access code would hand Mhasibu's key to anyone.
  if (!ACCESS_CODE && process.env.NODE_ENV === "production" && route !== "GET v1/status") {
    return Response.json({ error: "WEB_ACCESS_CODE is not set on the web app, so Mama's chat is closed." }, { status: 503 });
  }
  if (ACCESS_CODE && route !== "GET v1/status") {
    const given = request.headers.get("x-access-code") ?? url.searchParams.get("code") ?? "";
    if (!sameText(given, ACCESS_CODE)) return Response.json({ error: "access code needed" }, { status: 401 });
  }
  const target = new URL(`${UPSTREAM}/${path.join("/")}`);
  url.searchParams.forEach((v, k) => { if (k !== "code") target.searchParams.set(k, v); });
  const upstream = await fetch(target, {
    method: request.method,
    headers: { "content-type": "application/json", ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
    body: request.method === "POST" ? await request.text() : undefined,
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

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, { params }: Ctx) {
  return relay(request, (await params).path);
}
export async function POST(request: Request, { params }: Ctx) {
  return relay(request, (await params).path);
}

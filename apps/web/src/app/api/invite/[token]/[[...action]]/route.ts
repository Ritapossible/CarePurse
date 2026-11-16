// Mama's invite link: read it, ask for a code, check the code. A correct code sets her session
// cookie (httpOnly, a year), so she stays signed in and her chat only ever reaches her purse.
import { cookies } from "next/headers";
import { MAMA_COOKIE, mhasibuFetch, passThrough } from "@/lib/server/mhasibu";

type Ctx = { params: Promise<{ token: string; action?: string[] }> };
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export async function GET(_request: Request, { params }: Ctx) {
  const { token, action } = await params;
  if (!TOKEN.test(token) || action?.length) return Response.json({ error: "not found" }, { status: 404 });
  return passThrough(await mhasibuFetch(`/v1/invites/${token}`));
}

export async function POST(request: Request, { params }: Ctx) {
  const { token, action } = await params;
  const step = action?.join("/");
  if (!TOKEN.test(token) || (step !== "code" && step !== "verify")) return Response.json({ error: "not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (step === "code") return passThrough(await mhasibuFetch(`/v1/invites/${token}/code`, { method: "POST", body: { phone: body.phone } }));

  const res = await mhasibuFetch(`/v1/invites/${token}/verify`, { method: "POST", body: { phone: body.phone, code: body.code } });
  const data = await res.json().catch(() => ({ error: "Mhasibu is not reachable right now." }));
  if (!res.ok) return Response.json(data, { status: res.status });
  (await cookies()).set(MAMA_COOKIE, data.session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
  return Response.json({ ok: true });
}

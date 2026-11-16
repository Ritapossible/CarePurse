// The daughter's sign-up and dashboard. Every call needs her Privy login: we verify the access
// token here and pass Mhasibu the Privy user id from the token, never one from the browser.
import { privyConfigured, privyUser } from "@/lib/server/privy";
import { mhasibuFetch, passThrough } from "@/lib/server/mhasibu";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(request: Request, path: string[]) {
  if (!privyConfigured()) return Response.json({ error: "Sign-up isn’t set up yet (NEXT_PUBLIC_PRIVY_APP_ID)." }, { status: 503 });
  const privyId = await privyUser(request);
  if (!privyId) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const route = `${request.method} ${path.join("/")}`;
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};

  switch (route) {
    case "GET purse":
      return passThrough(await mhasibuFetch(`/v1/family?privyId=${encodeURIComponent(privyId)}`));
    case "POST meter":
      return passThrough(await mhasibuFetch("/v1/meters/verify", { method: "POST", body: { meter: body.meter, disco: body.disco } }));
    case "POST prepare":
      return passThrough(await mhasibuFetch("/v1/family/prepare", {
        method: "POST",
        body: {
          guardian: { privyId, address: body.guardian?.address, name: body.guardian?.name, email: body.guardian?.email },
          mama: body.mama, meter: body.meter, disco: body.disco, network: body.network, preset: body.preset,
        },
      }));
    case "POST complete":
      return passThrough(await mhasibuFetch("/v1/family/complete", { method: "POST", body: { privyId, signature: body.signature } }));
    case "POST test-usdc":
      return passThrough(await mhasibuFetch("/v1/family/test-usdc", { method: "POST", body: { privyId } }));
    case "POST invite":
      return passThrough(await mhasibuFetch("/v1/family/invite", { method: "POST", body: { privyId } }));
    default:
      return Response.json({ error: "not found" }, { status: 404 });
  }
}

// Deploying a purse and saving its rules on Stellar takes a few ledgers.
export const maxDuration = 60;

export async function GET(request: Request, { params }: Ctx) {
  return handle(request, (await params).path);
}
export async function POST(request: Request, { params }: Ctx) {
  return handle(request, (await params).path);
}

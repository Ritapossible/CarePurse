// The daughter's sign-up and dashboard. Every call needs her Privy login: we verify the access
// token here and pass Mhasibu the Privy user id from the token, never one from the browser.
import { privyConfigured, privyStellarWallets, privyUser, privyWalletCheckConfigured } from "@/lib/server/privy";
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
    case "GET activity": {
      const q = new URL(request.url).searchParams;
      const params = new URLSearchParams({ privyId });
      for (const k of ["utility", "offset", "limit"]) if (q.get(k)) params.set(k, q.get(k)!);
      return passThrough(await mhasibuFetch(`/v1/family/activity?${params}`));
    }
    case "GET profile":
      return passThrough(await mhasibuFetch(`/v1/family/profile?privyId=${encodeURIComponent(privyId)}`));
    case "POST profile":
      return passThrough(await mhasibuFetch("/v1/family/profile", { method: "POST", body: { privyId, name: body.name, avatar: body.avatar } }));
    case "POST delete":
      return passThrough(await mhasibuFetch("/v1/family/delete", { method: "POST", body: { privyId } }));
    case "POST meter":
      return passThrough(await mhasibuFetch("/v1/meters/verify", { method: "POST", body: { meter: body.meter, disco: body.disco } }));
    case "POST prepare": {
      // The guardian must be her own Privy Stellar wallet, confirmed with Privy on our server, not
      // whatever address the browser sends. Without the check configured, sign-up stays closed.
      if (!privyWalletCheckConfigured()) return Response.json({ error: "Sign-up is paused: the server can’t confirm your wallet yet (PRIVY_APP_SECRET)." }, { status: 503 });
      const wallets = await privyStellarWallets(privyId).catch(() => null);
      if (!wallets) return Response.json({ error: "We couldn’t confirm your wallet with Privy. Please try again." }, { status: 502 });
      if (!wallets.includes(String(body.guardian?.address ?? ""))) return Response.json({ error: "That wallet isn’t the CarePurse wallet on your account. Please reload and try again." }, { status: 403 });
      return passThrough(await mhasibuFetch("/v1/family/prepare", {
        method: "POST",
        body: {
          guardian: { privyId, address: body.guardian?.address, name: body.guardian?.name, email: body.guardian?.email },
          mama: body.mama, meter: body.meter, disco: body.disco, network: body.network, preset: body.preset,
        },
      }));
    }
    case "POST complete":
      return passThrough(await mhasibuFetch("/v1/family/complete", { method: "POST", body: { privyId, signature: body.signature } }));
    case "POST limits-prepare":
      return passThrough(await mhasibuFetch("/v1/family/limits/prepare", { method: "POST", body: { privyId, preset: body.preset } }));
    case "POST limits-complete":
      return passThrough(await mhasibuFetch("/v1/family/limits/complete", { method: "POST", body: { privyId, signature: body.signature } }));
    case "POST pause":
      return passThrough(await mhasibuFetch("/v1/family/pause", { method: "POST", body: { privyId, paused: Boolean(body.paused) } }));
    case "POST withdraw":
      return passThrough(await mhasibuFetch("/v1/family/withdraw", { method: "POST", body: { privyId, usdc: body.usdc, to: body.to } }));
    case "POST agent-move":
      return passThrough(await mhasibuFetch("/v1/family/agent", { method: "POST", body: { privyId } }));
    case "POST action-cancel":
      return passThrough(await mhasibuFetch("/v1/family/action/cancel", { method: "POST", body: { privyId } }));
    case "POST action-complete":
      return passThrough(await mhasibuFetch("/v1/family/action/complete", { method: "POST", body: { privyId, signature: body.signature } }));
    case "POST test-usdc":
      return passThrough(await mhasibuFetch("/v1/family/test-usdc", { method: "POST", body: { privyId } }));
    case "POST notifications-read":
      return passThrough(await mhasibuFetch("/v1/family/notifications/read", { method: "POST", body: { privyId } }));
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

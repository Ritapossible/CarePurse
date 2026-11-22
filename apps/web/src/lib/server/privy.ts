// Checks the daughter's Privy login on our server. Privy access tokens are ES256 JWTs
// (issuer "privy.io", audience = our App ID), verified with Privy's public keys for our app.
// Her Stellar wallet is confirmed with Privy's server API (PRIVY_APP_SECRET, server-only).
import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const jwks = APP_ID ? createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`)) : null;

export const privyConfigured = () => Boolean(APP_ID);

// The Privy user id (did:privy:…) from "Authorization: Bearer <access token>", or null.
export async function privyUser(request: Request): Promise<string | null> {
  if (!jwks) return null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: "privy.io", audience: APP_ID, algorithms: ["ES256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// The Stellar wallets Privy has linked to this user, read from Privy's server API with our app
// secret (never sent to the browser). The address the browser sends at sign-up must be one of
// these, so the purse's guardian is always her own Privy wallet. Null when the secret isn't set.
const APP_SECRET = process.env.PRIVY_APP_SECRET ?? "";
export const privyWalletCheckConfigured = () => Boolean(APP_ID && APP_SECRET);

type LinkedAccount = { type?: string; chain_type?: string; address?: string; email?: string };
// Her Stellar wallets and her email, as Privy has them (never as the browser says).
export async function privyAccount(userId: string): Promise<{ wallets: string[]; email: string | null } | null> {
  if (!privyWalletCheckConfigured()) return null;
  const res = await fetch(`https://api.privy.io/v1/users/${encodeURIComponent(userId)}`, {
    headers: { authorization: `Basic ${Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64")}`, "privy-app-id": APP_ID },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Privy answered ${res.status}`);
  const user = (await res.json()) as { linked_accounts?: LinkedAccount[] };
  const linked = user.linked_accounts ?? [];
  const wallets = linked.filter((a) => a.type === "wallet" && a.chain_type === "stellar" && a.address).map((a) => a.address!);
  const email = linked.find((a) => a.type === "email" && a.address)?.address ?? linked.find((a) => a.type === "google_oauth" && a.email)?.email ?? null;
  return { wallets, email };
}

// Checks the daughter's Privy login on our server. Privy access tokens are ES256 JWTs
// (issuer "privy.io", audience = our App ID), verified with Privy's public keys for our app.
// No Privy secret is needed.
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

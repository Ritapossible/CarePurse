// Each family's agent wallet key, sealed before it is stored on the purse record.
//
// Purse records are already encrypted at rest (DATA_ENCRYPTION_KEY). This is a second, separate
// lock: the key is sealed with AES-256-GCM under a key derived from the operator's own secret
// (AGENT_SECRET_KEY), which never leaves the server's environment. A copy of the database alone
// can't spend from any family's wallet.
import crypto from "node:crypto";

const VERSION = "v1";
const derive = (operatorSecret) => {
  if (!operatorSecret) throw new Error("AGENT_SECRET_KEY is needed to seal family agent keys");
  return crypto.createHash("sha256").update(`carepurse/agent-keys/${VERSION}:${operatorSecret}`).digest();
};

export function sealAgentKey(secret, operatorSecret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", derive(operatorSecret), iv);
  const body = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return `${VERSION}.${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64")}`;
}

export function openAgentKey(sealed, operatorSecret) {
  const [version, data] = String(sealed ?? "").split(".");
  if (version !== VERSION || !data) throw new Error("unknown sealed agent key");
  const raw = Buffer.from(data, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", derive(operatorSecret), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

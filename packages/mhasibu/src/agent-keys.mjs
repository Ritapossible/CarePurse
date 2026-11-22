// Each family's agent wallet key, sealed before it is stored on the purse record.
//
// Purse records are already encrypted at rest (DATA_ENCRYPTION_KEY). This is a second, separate
// lock with AES-256-GCM:
//   v2  under AGENT_SEAL_KEY, a key used for nothing else (recommended; can differ from the operator's)
//   v1  under a key derived from the operator's secret (AGENT_SECRET_KEY), used when no seal key is set
// New keys are sealed as v2 whenever AGENT_SEAL_KEY is set; v1 keys still open, so setting it later
// breaks nothing. A copy of the database alone can't spend from any family's wallet.
//
// `keys` is the config ({ agentSecret, agentSealKey }) or, for v1 only, the operator secret itself.
import crypto from "node:crypto";

const derive = (version, secret) => {
  if (!secret) throw new Error(version === "v2" ? "AGENT_SEAL_KEY is needed to open this key" : "AGENT_SECRET_KEY is needed to seal family agent keys");
  return crypto.createHash("sha256").update(`carepurse/agent-keys/${version}:${secret}`).digest();
};
const asKeys = (keys) => (typeof keys === "string" ? { agentSecret: keys } : keys ?? {});

export function sealAgentKey(secret, keys) {
  const { agentSecret, agentSealKey } = asKeys(keys);
  const version = agentSealKey ? "v2" : "v1";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", derive(version, version === "v2" ? agentSealKey : agentSecret), iv);
  const body = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return `${version}.${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64")}`;
}

export function openAgentKey(sealed, keys) {
  const { agentSecret, agentSealKey } = asKeys(keys);
  const [version, data] = String(sealed ?? "").split(".");
  if (!["v1", "v2"].includes(version) || !data) throw new Error("unknown sealed agent key");
  const raw = Buffer.from(data, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", derive(version, version === "v2" ? agentSealKey : agentSecret), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

// Family key sealing (v1 operator-derived, v2 separate seal key) and the NEAR privacy re-check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { openAgentKey, sealAgentKey } from "../src/agent-keys.mjs";
import { openUnderstander } from "../src/understand.mjs";

test("with AGENT_SEAL_KEY, keys are sealed under it (v2); older v1 keys still open", () => {
  const family = Keypair.random().secret();
  const operator = Keypair.random().secret();
  const v1 = sealAgentKey(family, { agentSecret: operator });
  assert.match(v1, /^v1\./);
  const keys = { agentSecret: operator, agentSealKey: "s".repeat(40) };
  const v2 = sealAgentKey(family, keys);
  assert.match(v2, /^v2\./);
  assert.equal(openAgentKey(v2, keys), family);
  assert.equal(openAgentKey(v1, keys), family); // old keys keep working after the seal key is set
  assert.throws(() => openAgentKey(v2, { agentSecret: operator })); // the operator key alone can't open v2
  assert.throws(() => openAgentKey(v2, { agentSecret: operator, agentSealKey: "x".repeat(40) }));
});

test("NEAR privacy is re-checked: if the model stops being private, Mama's words stop going to it", async () => {
  let verifiable = true;
  let modelCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/model/list")) return { ok: true, json: async () => ({ models: [{ modelId: "m", metadata: { verifiable } }] }) };
    modelCalls++;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ intent: "help", utility: null, choice: null }) } }] }) };
  };
  const u = await openUnderstander({ apiKey: "k", api: "openai", baseURL: "https://cloud-api.near.ai/v1", model: "m" }, { fetchImpl, log: { warn() {}, info() {} } });
  await u.understand("hello");
  assert.equal(modelCalls, 1);
  verifiable = false;
  await u.recheck();
  const r = await u.understand("abeg light don finish");
  assert.equal(modelCalls, 1); // not sent to the model any more
  assert.equal(r.intent, "buy"); // the scripted parser answered
  assert.match(u.lastVia, /no longer private/);
  verifiable = true;
  await u.recheck();
  await u.understand("hello");
  assert.equal(modelCalls, 2);
});

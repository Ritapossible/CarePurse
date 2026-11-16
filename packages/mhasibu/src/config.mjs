// Mhasibu's settings, read from the repo's root .env.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createHash } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const env = (name, fallback = "") => (process.env[name] ?? fallback).trim();
const gatewayUrl = env("GATEWAY_URL", "http://localhost:4021");
const llmApi = env("LLM_API") || (/near\.ai/.test(env("LLM_BASE_URL")) ? "openai" : "anthropic");
if (!["openai", "anthropic"].includes(llmApi)) throw new Error("LLM_API must be openai or anthropic.");

export const config = {
  network: env("STELLAR_NETWORK", "stellar:testnet"),
  rpcUrl: env("STELLAR_RPC_URL", "https://soroban-testnet.stellar.org"),
  horizonUrl: env("STELLAR_HORIZON_URL", "https://horizon-testnet.stellar.org"),
  explorerUrl: env("STELLAR_EXPLORER_URL", "https://stellar.expert/explorer/testnet"),
  usdc: {
    contractId: env("USDC_CONTRACT_ID", "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"),
    issuer: env("USDC_ISSUER", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
    decimals: Number(env("USDC_DECIMALS", "7")),
  },
  gatewayUrl,
  // The allowlist: Mhasibu only ever pays this host, and only this wallet.
  allowedHost: new URL(gatewayUrl).host,
  gatewayRecipient: env("GATEWAY_RECIPIENT"),
  agentSecret: env("AGENT_SECRET_KEY"),
  // Key for the meter/phone fingerprints on-chain (see destHash). DEST_HASH_KEY if set, otherwise
  // derived from the agent secret (rotating that key means re-running npm run sync-purse).
  destHashKey: env("DEST_HASH_KEY") || (env("AGENT_SECRET_KEY") ? createHash("sha256").update(`carepurse/dest-hash-key/v1:${env("AGENT_SECRET_KEY")}`).digest("hex") : ""),
  // Phase 2: the purse contract holds the money and enforces the caps on-chain (npm run deploy-purse).
  // Empty = Phase 1, where the agent wallet is the purse.
  purseContractId: env("PURSE_CONTRACT_ID"),
  ngnPerUsdc: Number(env("NGN_PER_USDC", "1470")),
  // CarePurse's service fee on top of face value (basis points, 300 = 3%), same as the gateway's.
  // Limits stay in face value; the on-chain caps add the fee (capBaseUnits).
  serviceFeeBps: (() => {
    const value = Number(env("SERVICE_FEE_BPS", "300"));
    if (!Number.isInteger(value) || value < 0 || value > 1000) throw new Error("SERVICE_FEE_BPS must be a whole number from 0 to 1000 (0% to 10%).");
    return value;
  })(),
  pursesFile: path.resolve(repoRoot, env("PURSES_FILE", ".data/purses.json")),
  // Postgres for purses, purchases, tokens and chat, so they survive restarts. Empty = the JSON file.
  databaseUrl: env("DATABASE_URL"),
  // The gateway's key for its private order routes (same value as the gateway's GATEWAY_API_KEY).
  gatewayApiKey: env("GATEWAY_API_KEY"),
  llm: {
    // A model understands Mama's message. Without a key, the built-in scripted parser does it.
    // Default (privacy): NEAR AI Cloud, OpenAI-style API, a verifiable model that runs in a TEE:
    //   LLM_API=openai  LLM_BASE_URL=https://cloud-api.near.ai/v1  LLM_MODEL=deepseek-ai/DeepSeek-V4.1-Flash-1017
    // Claude instead: LLM_API=anthropic, LLM_BASE_URL empty (Anthropic) or OpenServ, LLM_MODEL=claude-opus-5-5.
    api: llmApi,
    // Each key goes only to its own kind of host: a NEAR key is never sent to Anthropic.
    apiKey: env("LLM_API_KEY") || (llmApi === "openai" ? env("NEARAI_API_KEY") : env("ANTHROPIC_API_KEY")),
    baseURL: env("LLM_BASE_URL") || undefined,
    model: env("LLM_MODEL", "claude-opus-5-5"),
  },
  maxModelSteps: 8,
  optionsTtlMinutes: 10,
  duplicateWindowMinutes: 30,
};

if (config.network !== "stellar:testnet") throw new Error("CarePurse runs on Stellar testnet only.");

export const explorer = { tx: (hash) => `${config.explorerUrl}/tx/${hash}` };

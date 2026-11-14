// Mhasibu's settings, read from the repo's root .env.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const env = (name, fallback = "") => (process.env[name] ?? fallback).trim();
const gatewayUrl = env("GATEWAY_URL", "http://localhost:4021");

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
  // Phase 2: the purse contract holds the money and enforces the caps on-chain (npm run deploy-purse).
  // Empty = Phase 1, where the agent wallet is the purse.
  purseContractId: env("PURSE_CONTRACT_ID"),
  ngnPerUsdc: Number(env("NGN_PER_USDC", "1470")),
  pursesFile: path.resolve(repoRoot, env("PURSES_FILE", ".data/purses.json")),
  // Postgres for purses, purchases, tokens and chat, so they survive restarts. Empty = the JSON file.
  databaseUrl: env("DATABASE_URL"),
  llm: {
    // Claude understands Mama's message. Without a key, the built-in scripted parser does it.
    // LLM_BASE_URL points the Anthropic SDK at another Messages-compatible host, e.g. OpenServ
    // (https://inference-api.openserv.ai, model IDs with dots: claude-opus-5.5). Empty = Anthropic.
    apiKey: env("LLM_API_KEY") || env("ANTHROPIC_API_KEY"),
    baseURL: env("LLM_BASE_URL") || undefined,
    model: env("LLM_MODEL", "claude-opus-5-5"),
  },
  maxModelSteps: 8,
  optionsTtlMinutes: 10,
  duplicateWindowMinutes: 30,
};

if (config.network !== "stellar:testnet") throw new Error("CarePurse runs on Stellar testnet only.");

export const explorer = { tx: (hash) => `${config.explorerUrl}/tx/${hash}` };

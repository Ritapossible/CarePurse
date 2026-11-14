// Every setting comes from the repo's root .env. Nothing is hard-coded here.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });

const env = (name, fallback = "") => (process.env[name] ?? fallback).trim();
const number = (name, fallback) => {
  const value = Number(env(name, String(fallback)));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} in .env must be a positive number`);
  return value;
};

const facilitatorChoice = env("FACILITATOR", "backup");

export const config = {
  network: env("STELLAR_NETWORK", "stellar:testnet"),
  rpcUrl: env("STELLAR_RPC_URL", "https://soroban-testnet.stellar.org"),
  horizonUrl: env("STELLAR_HORIZON_URL", "https://horizon-testnet.stellar.org"),
  explorerUrl: env("STELLAR_EXPLORER_URL", "https://stellar.expert/explorer/testnet"),
  usdc: {
    contractId: env("USDC_CONTRACT_ID", "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"),
    issuer: env("USDC_ISSUER", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"),
    decimals: number("USDC_DECIMALS", 7),
  },
  facilitator:
    facilitatorChoice === "primary"
      ? { name: "Built on Stellar (OpenZeppelin)", url: env("FACILITATOR_PRIMARY_URL"), apiKey: env("FACILITATOR_PRIMARY_API_KEY") }
      : { name: "Coinbase", url: env("FACILITATOR_BACKUP_URL", "https://x402.org/facilitator"), apiKey: "" },
  recipient: env("GATEWAY_RECIPIENT"),
  agentSecret: env("AGENT_SECRET_KEY"),
  // Render (and most hosts) set PORT; GATEWAY_PORT is for running locally.
  port: Number(process.env.PORT) || number("GATEWAY_PORT", 4021),
  gatewayUrl: env("GATEWAY_URL", "http://localhost:4021"),
  ngnPerUsdc: number("NGN_PER_USDC", 1470),
  // CarePurse's service fee on top of face value, in basis points (300 = 3%). Paid from the purse;
  // Mama never sees it, Adaeze does (receipts). 0 to switch it off.
  serviceFeeBps: number("SERVICE_FEE_BPS", 300),
  provider: env("UTILITY_PROVIDER", "mock"),
  vtpass: {
    baseUrl: env("VTPASS_BASE_URL", "https://sandbox.vtpass.com/api"),
    apiKey: env("VTPASS_API_KEY"),
    secretKey: env("VTPASS_SECRET_KEY"),
    publicKey: env("VTPASS_PUBLIC_KEY"),
    // VTpass asks for a phone on electricity purchases; Mhasibu sends Mama's, this is the fallback.
    contactPhone: env("VTPASS_CONTACT_PHONE", "08011111111"),
  },
  ordersFile: path.resolve(repoRoot, env("ORDERS_FILE", ".data/orders.json")),
  // Postgres for orders (and their tokens), so they survive restarts. Empty = the JSON file.
  databaseUrl: env("DATABASE_URL"),
  orderTtlMinutes: number("ORDER_TTL_MINUTES", 10),
};

if (config.provider === "vtpass" && !/^https:\/\/sandbox\.vtpass\.com\//.test(config.vtpass.baseUrl)) {
  throw new Error("CarePurse uses the VTpass SANDBOX only. Set VTPASS_BASE_URL=https://sandbox.vtpass.com/api");
}

if (!(config.serviceFeeBps >= 0 && config.serviceFeeBps <= 1000)) {
  throw new Error("SERVICE_FEE_BPS must be between 0 and 1000 (0% to 10%).");
}

if (config.network !== "stellar:testnet") {
  throw new Error("CarePurse runs on Stellar testnet only. Set STELLAR_NETWORK=stellar:testnet");
}

export const explorer = {
  tx: (hash) => `${config.explorerUrl}/tx/${hash}`,
  account: (address) => `${config.explorerUrl}/account/${address}`,
};

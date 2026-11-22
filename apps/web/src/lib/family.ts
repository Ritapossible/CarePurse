"use client";
// The daughter's side: calls our /api/family routes with her Privy access token.
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useCallback } from "react";

export type Spend = { at: string; utility: string; ngn: number; feeNgn?: number; chargedNgn?: number; token?: string; units?: string; tx?: string; unconfirmed?: boolean };
export type Purse = {
  id: string;
  status: "pending" | "active";
  mama: { name: string; phone: string; language: "en" | "pcm" };
  guardian: { name: string; address: string };
  destinations: { electricity: string; airtime: string; data: string };
  preset: "light" | "standard";
  monthlyCap: number;
  contractId: string;
  balanceUsdc: number | null;
  balanceNgn: number | null;
  paused: boolean;
  invite: { status: "none" | "waiting" | "joined" | "expired"; expiresAt: string | null; usedAt: string | null };
  spends: Spend[];
  monthNgn?: number;
  spendableNgn?: number | null;
  feeBps?: number;
  withdrawals?: { at: string; usdc: number; to: string; tx: string }[];
  ownWallet?: boolean; // false: an older purse on the shared agent wallet (one approval moves it)
  rulesBehind?: boolean;
  // The limits saved on her purse (naira): what Mhasibu AI and the contract actually allow.
  limits?: Record<string, { perTopup?: number; perDay?: number; perWeek?: number; perMonth?: number }>;
  planOutdated?: boolean; // her plan gained a new limit since it was saved: approve to apply it // the on-chain caps are behind today’s naira rate: re-save the plan
  rate?: { ngnPerUsdc: number; asOf: string | null; live: boolean };
  notifications: { at: string; kind: string; text: string; read: boolean }[];
  unread?: number;
  testUsdcLeft: number;
};

export type Profile = { name: string; avatar: string | null; address: string; email: string | null; purseStatus: string; contractId: string };

export const PRESETS = {
  light: { label: "Light", electricity: "₦2,000 a time, ₦5,000 a week", airtime: "₦200 a time, ₦500 a day", data: "₦200 a time, ₦500 a day", monthly: 50_000 },
  standard: { label: "Standard", electricity: "₦5,000 a time, ₦15,000 a week", airtime: "₦500 a time, ₦1,000 a day", data: "₦1,000 a time, ₦1,000 a day", monthly: 120_000 },
} as const;

export const DISCOS = [
  ["ikeja-electric", "Ikeja Electric"], ["eko-electric", "Eko Electric"], ["abuja-electric", "Abuja Electric"], ["ibadan-electric", "Ibadan Electric"],
  ["enugu-electric", "Enugu Electric"], ["portharcourt-electric", "Port Harcourt Electric"], ["benin-electric", "Benin Electric"], ["kano-electric", "Kano Electric"],
  ["kaduna-electric", "Kaduna Electric"], ["jos-electric", "Jos Electric"], ["aba-electric", "Aba Power"], ["yola-electric", "Yola Electric"],
] as const;
export const NETWORKS = [["mtn", "MTN"], ["airtel", "Airtel"], ["glo", "Glo"], ["etisalat", "9mobile"]] as const;

export const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
export const explorer = (kind: "contract" | "tx" | "account", id: string) => `https://stellar.expert/explorer/testnet/${kind}/${id}`;
export const inviteUrl = (token: string) => `${window.location.origin}/i/${token}`;
export const whatsappUrl = (mamaName: string, token: string) =>
  `https://wa.me/?text=${encodeURIComponent(`Mama ${mamaName}, I’ve set up CarePurse for you. Tap here to start: ${inviteUrl(token)}`)}`;

export function useFamilyApi() {
  const { getAccessToken } = usePrivy();
  return useCallback(async <T,>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
    const token = await getAccessToken();
    const res = await fetch(`/api/family/${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
    return data as T;
  }, [getAccessToken]);
}

// Her Stellar wallet from Privy: the one she has, or a new one.
export function useStellarWallet() {
  const { user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const existing = user?.linkedAccounts.find((a) => a.type === "wallet" && (a as { chainType?: string }).chainType === "stellar") as { address: string } | undefined;
  const ensure = useCallback(async () => existing?.address ?? (await createWallet({ chainType: "stellar" })).wallet.address, [existing?.address, createWallet]);
  const sign = useCallback((address: string, hashHex: string) => signRawHash({ address, chainType: "stellar", hash: `0x${hashHex}` }), [signRawHash]);
  return { address: existing?.address ?? null, ensure, sign };
}

"use client";
// Privy for the daughter's pages only (sign-up and dashboard). Email or Google; Privy makes her a
// Stellar wallet (no seed phrase). No Ethereum or Solana wallets are created.
import { PrivyProvider } from "@privy-io/react-auth";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export default function PrivyRoot({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium">Sign-up isn’t set up yet</h1>
        <p className="mt-3 text-secondary">Add NEXT_PUBLIC_PRIVY_APP_ID to the web app’s settings.</p>
      </div>
    );
  }
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "light", accentColor: "#0a0a0a", landingHeader: "Set up CarePurse for your mum" },
        embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

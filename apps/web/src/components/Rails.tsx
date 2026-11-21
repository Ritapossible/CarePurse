import Image from "next/image";

// What CarePurse runs on, with each project's own logo (public/logos).
// Soroban is Stellar's smart-contract platform and has no separate logo, so it carries Stellar's mark.
export const RAILS = [
  { name: "Stellar", logo: "/logos/stellar.svg", w: 24, h: 24, label: "Stellar", what: "USDC payments and the purse contract (Soroban)" },
  { name: "x402", logo: "/logos/x402.svg", w: 62, h: 24, label: null, what: "Mhasibu AI pays for each top-up over HTTP" },
  { name: "Soroban", logo: "/logos/stellar.svg", w: 24, h: 24, label: "Soroban", what: "Spending limits enforced on-chain" },
  { name: "USDC", logo: "/logos/usdc.svg", w: 24, h: 24, label: "USDC", what: "The money in the purse" },
  { name: "NEAR AI", logo: "/logos/near.svg", w: 20, h: 20, label: "NEAR AI", what: "A private model, in sealed hardware, reads Mama’s messages" },
  { name: "Privy", logo: "/logos/privy.png", w: 22, h: 22, label: "Privy", what: "The daughter’s sign-in and her Stellar wallet, with no seed phrase" },
  { name: "VTpass", logo: "/logos/vtpass.png", w: 74, h: 20, label: null, what: "Electricity tokens, airtime and data (sandbox)" },
] as const;

export function RailLogo({ rail }: { rail: (typeof RAILS)[number] }) {
  return (
    <span className="inline-flex items-center gap-2 text-[17px] font-medium text-foreground">
      <Image src={rail.logo} alt={rail.label ? "" : rail.name} width={rail.w} height={rail.h} unoptimized className="shrink-0" style={{ height: rail.h, width: "auto" }} />
      {rail.label}
    </span>
  );
}

export default function Rails() {
  return (
    <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-12 gap-y-6 px-6 py-8">
      {RAILS.map((r) => (
        <li key={r.name}>
          <RailLogo rail={r} />
        </li>
      ))}
    </ul>
  );
}

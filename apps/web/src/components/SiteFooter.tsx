import Link from "next/link";
import { Logo } from "./SiteHeader";

const REPO = "https://github.com/Ritapossible/CarePurse";

const RAILS = [
  { name: "Stellar", what: "USDC payments and the purse contract (Soroban)." },
  { name: "x402", what: "Mhasibu pays for each top-up over HTTP." },
  { name: "NEAR AI", what: "A private model, in sealed hardware, reads Mama’s messages." },
  { name: "VTpass", what: "Electricity tokens, airtime and data (sandbox)." },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-muted">Electricity, airtime and data for family in Nigeria.</p>
        </div>
        <div>
          <h3 className="font-medium">Explore</h3>
          <ul className="mt-4 space-y-3 text-muted">
            <li><Link href="/demo" className="hover:text-foreground">Live demo</Link></li>
            <li><Link href="/chat" className="hover:text-foreground">Mama’s chat</Link></li>
            <li><Link href="/#how" className="hover:text-foreground">How it works</Link></li>
            <li><Link href="/#faq" className="hover:text-foreground">FAQ</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-medium">Build</h3>
          <ul className="mt-4 space-y-3 text-muted">
            <li><a href={REPO} className="hover:text-foreground">GitHub</a></li>
            <li><a href={`${REPO}/blob/main/ARCHITECTURE.md`} className="hover:text-foreground">Architecture</a></li>
            <li><a href={`${REPO}#security`} className="hover:text-foreground">Security</a></li>
            <li><a href={`${REPO}#privacy`} className="hover:text-foreground">Privacy</a></li>
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-6xl border-t border-line px-5 py-12">
        <p className="text-muted">Built on</p>
        <ul className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {RAILS.map((r) => (
            <li key={r.name}>
              <div className="text-xl font-semibold tracking-tight">{r.name}</div>
              <p className="mt-2 text-[15px] text-muted">{r.what}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-sm text-muted sm:flex-row sm:justify-between">
          <span>Live Stellar Testnet payment · sandbox utility fulfilment</span>
          <span>Built for EmpowerHER by Gloria &amp; Rita</span>
        </div>
      </div>
    </footer>
  );
}

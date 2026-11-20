import Link from "next/link";
import { RAILS, RailLogo } from "./Rails";
import { Logo } from "./SiteHeader";

const REPO = "https://github.com/Ritapossible/CarePurse";
const link = "transition-colors duration-150 hover:text-foreground";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-secondary">Electricity, airtime and data for family in Nigeria</p>
        </div>
        <div>
          <h3 className="font-medium">Explore</h3>
          <ul className="mt-4 space-y-3 text-muted">
            <li><Link href="/start" className={link}>Launch App</Link></li>
            <li><Link href="/#how" className={link}>How it works</Link></li>
            <li><Link href="/#faq" className={link}>FAQ</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-medium">Build</h3>
          <ul className="mt-4 space-y-3 text-muted">
            <li><a href={REPO} className={link}>GitHub</a></li>
            <li><a href={`${REPO}/blob/main/ARCHITECTURE.md`} className={link}>Architecture</a></li>
            <li><a href={`${REPO}#security`} className={link}>Security</a></li>
            <li><a href={`${REPO}#privacy`} className={link}>Privacy</a></li>
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-line py-8 opacity-70 grayscale">
          <span className="text-sm text-muted">Powered by</span>
          {RAILS.filter((r) => r.name !== "Soroban").map((r) => (
            <span key={r.name} title={r.what} className="scale-90">
              <RailLogo rail={r} />
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-sm text-muted sm:flex-row sm:justify-between">
          <span>© 2026 CarePurse. All rights reserved.</span>
          <span>Live Stellar Testnet payment · sandbox utility fulfilment</span>
        </div>
      </div>
    </footer>
  );
}

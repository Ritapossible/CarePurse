import Link from "next/link";
import LogoMark from "./LogoMark";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
  { href: "/chat", label: "Mama’s chat" },
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <LogoMark className="h-7 w-7" />
      <span className="text-[19px]">CarePurse</span>
    </Link>
  );
}

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="hidden items-center gap-8 text-[15px] text-muted md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/demo" className="rounded-full bg-foreground px-5 py-2.5 text-[15px] font-medium text-background hover:opacity-85">
            Open demo
          </Link>
          <details className="relative md:hidden">
            <summary aria-label="Menu" className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-line">
              <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
                <path d="M0 1h16M0 6h16M0 11h16" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </summary>
            <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-line bg-background p-2 shadow-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-xl px-3 py-2.5 text-[15px] hover:bg-surface">
                  {n.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

import Link from "next/link";
import LogoMark from "./LogoMark";
import MobileMenu from "./MobileMenu";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
  { href: "/dashboard", label: "Sign in" },
];

// The phone menu has room for every section.
const MENU = [
  { href: "/#how", label: "How it works" },
  { href: "/#log", label: "Receipts" },
  { href: "/#rules", label: "The rules" },
  { href: "/#faq", label: "FAQ" },
  { href: "/dashboard", label: "Sign in" },
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-medium ${className}`}>
      <LogoMark className="h-7 w-7" />
      <span className="text-lg">CarePurse</span>
    </Link>
  );
}

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[#fbf9f6]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-[15px] text-secondary md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition-colors duration-150 hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/start" className="inline-flex h-9 items-center rounded-[10px] bg-foreground px-4 text-[15px] font-medium text-background transition-colors duration-150 hover:bg-[#2b2825]">
            Launch App
          </Link>
          <MobileMenu items={MENU} />
        </div>
      </div>
    </header>
  );
}

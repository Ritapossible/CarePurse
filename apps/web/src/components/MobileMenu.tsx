"use client";
// The menu on phones: the header becomes a card with a close button, and a second card below it
// holds large links and the main action. The page behind is dimmed and doesn't scroll.
import Link from "next/link";
import { useEffect, useState } from "react";
import LogoMark from "./LogoMark";

type Item = { href: string; label: string };

export default function MobileMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid h-9 w-9 place-items-center rounded-lg border border-line transition-colors duration-150 hover:bg-surface md:hidden"
      >
        <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
          <path d="M0 1h16M0 6h16M0 11h16" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative mx-3 mt-3 space-y-3">
            <div className="flex h-16 items-center justify-between rounded-[20px] border border-line bg-background px-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
              <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2 text-lg font-semibold">
                <LogoMark className="h-7 w-7" />
                CarePurse
              </Link>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg transition-colors duration-150 hover:bg-surface">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 2l12 12M14 2 2 14" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </div>
            <nav className="rounded-[20px] border border-line bg-background px-6 pb-6 pt-2 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
              <ul>
                {items.map((i) => (
                  <li key={i.href} className="border-b border-dashed border-line">
                    <Link href={i.href} onClick={() => setOpen(false)} className="block py-5 text-[32px] font-medium leading-none tracking-[-0.02em] transition-colors duration-150 hover:text-secondary">
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/start"
                onClick={() => setOpen(false)}
                className="mt-6 flex h-14 items-center justify-center gap-2 rounded-[10px] bg-foreground text-lg font-medium text-background transition-colors duration-150 hover:bg-[#262626]"
              >
                Launch App
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

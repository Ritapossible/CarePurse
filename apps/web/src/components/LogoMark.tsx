// The CarePurse mark: a purse with a bolt (Mama's money, and the power it keeps on).
// Drawn in currentColor; the bolt is cut out with --logo-bg (white by default).
export default function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="CarePurse">
      <path d="M11 10.5V9a5 5 0 0 1 10 0v1.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="4" y="10" width="24" height="19" rx="6" fill="currentColor" />
      <path d="M17.6 13.2 11.8 20.4h4.1l-1.5 5.4 5.8-7.2h-4.1z" style={{ fill: "var(--logo-bg, #fff)" }} />
    </svg>
  );
}

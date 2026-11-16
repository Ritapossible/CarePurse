// The CarePurse mark: Mama's clasp purse with a bolt (power: light, airtime, data).
// Drawn in currentColor; the bolt is cut out with --logo-bg (white by default).
export default function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="CarePurse">
      <circle cx="13.6" cy="5.6" r="2.3" fill="currentColor" />
      <circle cx="18.4" cy="5.6" r="2.3" fill="currentColor" />
      <path d="M6.5 11.5Q16 6.2 25.5 11.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M6 12.5h20l2 11.5a5 5 0 0 1-4.9 5.8H8.9A5 5 0 0 1 4 24z" fill="currentColor" />
      <path d="M17.6 14.6 12.2 21.2h3.8l-1.4 5 5.4-6.6h-3.8z" style={{ fill: "var(--logo-bg, #fff)" }} />
    </svg>
  );
}

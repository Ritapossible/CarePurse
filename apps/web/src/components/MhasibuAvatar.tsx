// Mhasibu, the agent: Mama's purse with two eyes. The same bag as the CarePurse logo,
// with eyes in place of the bolt: Mhasibu lives in the purse and looks after it.
export default function MhasibuAvatar({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Mhasibu">
      <path d="M11 10.5V9a5 5 0 0 1 10 0v1.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="4" y="10" width="24" height="19" rx="7" fill="currentColor" />
      <rect x="11" y="16" width="3.2" height="6" rx="1.6" style={{ fill: "var(--logo-bg, #fff)" }} />
      <rect x="17.8" y="16" width="3.2" height="6" rx="1.6" style={{ fill: "var(--logo-bg, #fff)" }} />
    </svg>
  );
}

// Mhasibu, the agent: Mama's purse with a friendly face. The same bag as the CarePurse logo,
// with eyes and a smile in place of the bolt: Mhasibu lives in the purse and looks after it.
export default function MhasibuAvatar({ className = "h-9 w-9" }: { className?: string }) {
  const face = { fill: "var(--logo-bg, #fff)" };
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Mhasibu">
      <path d="M11 10.5V9a5 5 0 0 1 10 0v1.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="4" y="10" width="24" height="19" rx="7" fill="currentColor" />
      <ellipse cx="12.6" cy="19" rx="1.8" ry="3" style={face} />
      <ellipse cx="19.4" cy="19" rx="1.8" ry="3" style={face} />
      <path d="M12.4 24.2q3.6 2 7.2 0" fill="none" strokeWidth="1.4" strokeLinecap="round" style={{ stroke: "var(--logo-bg, #fff)" }} />
    </svg>
  );
}

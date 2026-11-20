// One top-up, the same card everywhere: the landing hero, Mama's chat, her purchases and the
// daughter's dashboard. The CarePurse mark in an ink circle, what was bought, the token in mono
// (the site's signature) and its status.
import LogoMark from "./LogoMark";

export function Mark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-foreground text-background [--logo-bg:var(--foreground)] ${className}`}>
      <LogoMark className="h-[55%] w-[55%]" />
    </span>
  );
}

export function Status({ checking = false, label = true }: { checking?: boolean; label?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-secondary">
      <span className={`h-1.5 w-1.5 rounded-full ${checking ? "bg-muted" : "bg-live"}`} aria-label={checking ? "Checking" : "Delivered"} />
      {label && <span className="hidden sm:inline">{checking ? "Checking" : "Delivered"}</span>}
    </span>
  );
}

export default function TokenCard({
  title,
  token,
  meta,
  right,
  large = false,
  className = "",
}: {
  title: string; // "Electricity · ₦5,000"
  token?: string | null; // the 20-digit token, light only
  meta?: string | null; // "Today, 21:00 · Meter 1111" when there is no token, or under it
  right?: React.ReactNode; // status, amount or a Copy button
  large?: boolean; // Mama's screens: the token in a bigger size
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl p-4 ${className}`}>
      <Mark />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {token && <div className={`whitespace-nowrap font-mono ${large ? "mt-0.5 text-[15px] font-semibold" : "text-xs text-secondary"}`}>{token}</div>}
        {meta && <div className="truncate text-xs text-muted">{meta}</div>}
      </div>
      {right}
    </div>
  );
}

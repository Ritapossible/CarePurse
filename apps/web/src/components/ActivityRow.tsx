// One top-up in the daughter's history: what Mama got, the token (electricity), what the purse
// paid including the service fee, and the Stellar receipt. Used by the dashboard and /activity.
import TokenCard from "@/components/TokenCard";
import { type Spend, explorer, naira } from "@/lib/family";

export const LAGOS = "Africa/Lagos";
export const UTILITY: Record<string, string> = { electricity: "Electricity", airtime: "Airtime", data: "Data" };

const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: LAGOS });
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-NG", { timeZone: LAGOS, hour: "numeric", minute: "2-digit" });

// "Today", "Yesterday" or "Mon, 18 Nov", in Lagos time.
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(new Date(today.getTime() - 86_400_000))) return "Yesterday";
  return d.toLocaleDateString("en-NG", { timeZone: LAGOS, weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
export const when = (iso: string) => `${dayLabel(iso)}, ${timeOf(iso)}`;
export const sameDay = (a: string, b: string) => dayKey(new Date(a)) === dayKey(new Date(b));

export default function ActivityRow({ s, timeOnly = false }: { s: Spend; timeOnly?: boolean }) {
  return (
    <li>
      <TokenCard
        title={UTILITY[s.utility] ?? s.utility}
        token={s.utility === "electricity" ? s.token : null}
        meta={`${timeOnly ? timeOf(s.at) : when(s.at)}${s.units ? ` · ${s.units}` : ""}${s.unconfirmed ? " · Checking" : ""}`}
        className="border border-line bg-white"
        right={
          <div className="shrink-0 text-right">
            <div className="text-sm font-medium tabular-nums">−{naira(s.chargedNgn ?? s.ngn)}</div>
            {s.feeNgn ? <div className="text-xs text-muted">incl. {naira(s.feeNgn)} fee</div> : null}
            {s.tx && <a href={explorer("tx", s.tx)} target="_blank" rel="noreferrer" className="text-xs text-muted underline-offset-4 hover:underline">Receipt</a>}
          </div>
        }
      />
    </li>
  );
}

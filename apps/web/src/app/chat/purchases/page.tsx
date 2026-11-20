"use client";
// Mama's purchases: every top-up Mhasibu bought for her, grouped by day, newest first.
// Same big, plain style as her chat. Amounts are face value (the service fee is her daughter's).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Footer from "@/components/Footer";
import { type Purchase, loadPurchases } from "@/lib/mhasibu";

type Filter = "all" | Purchase["utility"];
const FILTERS: [Filter, string][] = [["all", "All"], ["electricity", "Light"], ["airtime", "Airtime"], ["data", "Data"]];
const NAME = { electricity: "Light", airtime: "Airtime", data: "Data" } as const;
const LAGOS = "Africa/Lagos";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: LAGOS }); // 2026-11-16
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-NG", { timeZone: LAGOS, hour: "numeric", minute: "2-digit" });

function dayTitle(key: string) {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-NG", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
}

function Token({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
      <span className="whitespace-nowrap font-mono text-[15px] font-semibold tracking-wide">{value}</span>
      <button
        onClick={() => navigator.clipboard?.writeText(value.replace(/\s/g, "")).then(() => setCopied(true)).catch(() => {})}
        className="shrink-0 rounded-lg border border-foreground px-3 py-1 text-sm transition-colors duration-150 hover:bg-white"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Row({ p }: { p: Purchase }) {
  const to = p.utility === "electricity" ? `Meter ${p.to}` : p.to;
  return (
    <li className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[17px] font-semibold">{NAME[p.utility]}</div>
          <div className="mt-0.5 truncate text-sm text-muted">{time(p.at)} · {to}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[17px] font-semibold tabular-nums">{naira(p.ngn)}</div>
          {p.status === "checking" && <div className="text-sm text-muted">Checking</div>}
        </div>
      </div>
      {p.token && <Token value={p.token} />}
      {(p.units || p.link) && (
        <div className="mt-2 flex items-center justify-between text-sm text-muted">
          <span>{p.units ?? ""}</span>
          {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="underline">Receipt on Stellar</a>}
        </div>
      )}
    </li>
  );
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    loadPurchases()
      .then((r) => setPurchases(r.purchases))
      .catch((e) => setError(String(e?.message).includes("access code") ? "Please open CarePurse from the link your child sent you." : "Your purchases can’t be loaded right now. Try again soon."));
  }, []);

  const shown = useMemo(() => (purchases ?? []).filter((p) => filter === "all" || p.utility === filter), [purchases, filter]);
  const days = useMemo(() => {
    const groups = new Map<string, Purchase[]>();
    for (const p of shown) groups.set(dayKey(p.at), [...(groups.get(dayKey(p.at)) ?? []), p]);
    return [...groups.entries()];
  }, [shown]);
  const month = useMemo(() => {
    if (!purchases) return { ngn: 0, count: 0 }; // still loading: no clock read while the page is prerendered
    const now = dayKey(new Date().toISOString()).slice(0, 7);
    const inMonth = purchases.filter((p) => dayKey(p.at).startsWith(now));
    return { ngn: inMonth.reduce((s, p) => s + p.ngn, 0), count: inMonth.length };
  }, [purchases]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-3 pt-3">
      <section className="flex-1 rounded-[20px] border border-line bg-white">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <Link href="/chat" aria-label="Back to chat" className="-ml-1 rounded-lg p-1 transition-colors duration-150 hover:bg-surface">
            <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true"><path d="M14 8H3M7 3.5 2.5 8 7 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </Link>
          <h1 className="text-lg font-semibold">My purchases</h1>
        </header>

        <div className="px-5 pt-5">
          <p className="text-sm text-muted">This month</p>
          <p className="mt-1 text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{naira(month.ngn)}</p>
          <p className="mt-1 text-sm text-muted">{month.count === 1 ? "1 top-up" : `${month.count} top-ups`}</p>

          <div className="mt-5 flex gap-2" role="tablist" aria-label="Show">
            {FILTERS.map(([v, l]) => (
              <button
                key={v}
                role="tab"
                aria-selected={filter === v}
                onClick={() => setFilter(v)}
                className={`h-9 rounded-full border px-4 text-sm font-medium transition-colors duration-150 ${filter === v ? "border-foreground bg-foreground text-background" : "border-line hover:border-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="pb-4 pt-5">
          {error && <p className="mx-5 rounded-xl bg-danger-soft px-4 py-3 text-danger">{error}</p>}
          {!error && purchases === null && <p className="px-5 text-muted">Loading…</p>}
          {!error && purchases !== null && days.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-[17px]">{filter === "all" ? "Nothing bought yet." : `No ${NAME[filter as Purchase["utility"]].toLowerCase()} bought yet.`}</p>
              <Link href="/chat" className="mt-4 inline-flex h-11 items-center rounded-[10px] bg-foreground px-5 font-medium text-background">Ask Mhasibu</Link>
            </div>
          )}
          {days.map(([key, list]) => (
            <div key={key} className="mt-2 first:mt-0">
              <div className="flex items-baseline justify-between bg-surface px-5 py-2 text-sm">
                <span className="font-medium">{dayTitle(key)}</span>
                <span className="tabular-nums text-muted">{naira(list.reduce((s, p) => s + p.ngn, 0))}</span>
              </div>
              <ul className="divide-y divide-line">
                {list.map((p, i) => <Row key={`${p.at}-${i}`} p={p} />)}
              </ul>
            </div>
          ))}
        </div>

        {purchases && purchases.length > 0 && (
          <p className="border-t border-line px-5 py-4 text-sm text-muted">
            You can also ask Mhasibu, for example: &ldquo;What did I buy yesterday?&rdquo;
          </p>
        )}
      </section>
      <Footer />
    </main>
  );
}

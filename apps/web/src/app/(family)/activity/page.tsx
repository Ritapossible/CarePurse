"use client";
// Mama's full purchase history for the daughter: a summary, a filter by utility, the top-ups
// grouped by day (Lagos time), and "Load more" 20 at a time. The dashboard shows only the latest 3.
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ActivityRow, { dayLabel, sameDay } from "@/components/ActivityRow";
import AuthCard from "@/components/AuthCard";
import { type Spend, naira, useFamilyApi } from "@/lib/family";

type Page = { items: Spend[]; total: number; nextOffset: number | null; totals: { ngn: number; chargedNgn: number; feeNgn: number }; mama: { name: string } };
const FILTERS = [
  { key: "", label: "All" },
  { key: "electricity", label: "Electricity" },
  { key: "airtime", label: "Airtime" },
  { key: "data", label: "Data" },
] as const;

export default function ActivityPage() {
  const { ready, authenticated, login } = usePrivy();
  const api = useFamilyApi();
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<Page | null>(null);
  const [items, setItems] = useState<Spend[]>([]);
  const [loading, setLoading] = useState<"first" | "more" | null>("first");
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (offset: number) => api<Page>("GET", `activity?${new URLSearchParams({ offset: String(offset), limit: "20", ...(filter ? { utility: filter } : {}) })}`),
    [api, filter],
  );

  useEffect(() => {
    if (!ready || !authenticated) return;
    let live = true;
    const t = setTimeout(async () => {
      setLoading("first");
      setError(null);
      try {
        const page = await fetchPage(0);
        if (!live) return;
        setData(page);
        setItems(page.items);
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoading(null);
      }
    }, 0);
    return () => { live = false; clearTimeout(t); };
  }, [ready, authenticated, fetchPage]);

  async function more() {
    if (data?.nextOffset == null) return;
    setLoading("more");
    try {
      const page = await fetchPage(data.nextOffset);
      setData(page);
      setItems((now) => [...now, ...page.items]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  if (!ready) return <p className="text-muted">Loading…</p>;
  if (!authenticated) {
    return (
      <AuthCard
        title="Sign in"
        subtitle="Sign in to see everything Mama has bought."
        action="Sign in"
        onAction={() => login()}
        points={["Every top-up, by day", "Tokens and Stellar receipts", "What you paid, fee included"]}
        alt={{ text: "New here?", link: "Set up for your mum", href: "/start" }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted transition-colors duration-150 hover:text-foreground">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
          Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.01em]">Activity</h1>
        <p className="mt-1 text-sm text-muted">{data ? `Everything Mama ${data.mama.name} has bought with Mhasibu AI` : " "}</p>
      </div>

      {/* Summary for the current filter */}
      <section className="grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-white">
        {[
          ["Top-ups", data ? String(data.total) : "–"],
          ["Mama received", data ? naira(data.totals.ngn) : "–"],
          ["Fees", data ? naira(data.totals.feeNgn) : "–"],
        ].map(([label, value]) => (
          <div key={label} className="px-4 py-4 sm:px-5">
            <div className="text-xs text-muted sm:text-sm">{label}</div>
            <div className="mt-1 truncate text-base font-medium tabular-nums sm:text-lg">{value}</div>
          </div>
        ))}
      </section>

      {/* Filter */}
      <div role="tablist" aria-label="Filter by utility" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors duration-150 ${filter === f.key ? "border-foreground bg-foreground text-background" : "border-line bg-white text-secondary hover:border-foreground hover:text-foreground"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      {loading === "first" ? (
        <div className="space-y-3" aria-label="Loading">
          {[0, 1, 2].map((i) => <div key={i} className="h-[88px] animate-pulse rounded-2xl bg-surface" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
          <p className="font-medium">{filter ? `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} top-ups yet` : "No top-ups yet"}</p>
          <p className="mt-1 text-sm text-muted">When Mama asks Mhasibu AI for light, airtime or data, it shows here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {items.map((s, i) => (i === 0 || !sameDay(s.at, items[i - 1].at) ? i : -1)).filter((i) => i >= 0).map((start, g, starts) => {
            const day = items.slice(start, starts[g + 1] ?? items.length);
            return (
              <section key={day[0].at}>
                <h2 className="text-sm font-medium text-muted">{dayLabel(day[0].at)}</h2>
                <ul className="mt-2 space-y-3">{day.map((s, i) => <ActivityRow key={`${s.at}-${i}`} s={s} timeOnly />)}</ul>
              </section>
            );
          })}
          {data?.nextOffset != null ? (
            <button onClick={more} disabled={loading === "more"} className="flex h-11 w-full items-center justify-center rounded-xl border border-line bg-white text-sm font-medium transition-colors duration-150 hover:border-foreground disabled:opacity-50">
              {loading === "more" ? "Loading…" : `Load more (${data.total - items.length} left)`}
            </button>
          ) : (
            <p className="text-center text-sm text-muted">That’s everything</p>
          )}
        </div>
      )}
    </div>
  );
}

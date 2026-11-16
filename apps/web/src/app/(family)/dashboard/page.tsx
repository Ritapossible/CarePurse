"use client";
// The daughter's dashboard: balance, Mama's invite, receipts (with the fee, which only she sees),
// her rules and the purse on Stellar.
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PRESETS, type Purse, explorer, inviteUrl, naira, useFamilyApi, whatsappUrl } from "@/lib/family";

const secondary = "inline-flex h-11 items-center justify-center rounded-[10px] border border-line px-4 font-medium transition-colors duration-150 hover:bg-surface disabled:opacity-40";
const primary = "inline-flex h-11 items-center justify-center rounded-[10px] bg-foreground px-4 font-medium text-background transition-colors duration-150 hover:bg-[#262626]";
const when = (iso: string) => new Date(iso).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
const UTILITY = { electricity: "Light", airtime: "Airtime", data: "Data" } as Record<string, string>;
const INVITE = { none: "Not sent yet", waiting: "Waiting for Mama", joined: "Mama has joined", expired: "Link expired" } as const;

export default function DashboardPage() {
  const router = useRouter();
  const { ready, authenticated, login, logout } = usePrivy();
  const api = useFamilyApi();
  const [purse, setPurse] = useState<Purse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const { purse: p } = await api<{ purse: Purse | null }>("GET", "purse");
      if (!p || p.status !== "active") return router.replace("/start");
      setPurse(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, router]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    const t = setTimeout(load, 0); // load after render, not inside it
    return () => clearTimeout(t);
  }, [ready, authenticated, load]);

  async function act(what: "invite" | "test-usdc") {
    setError(null);
    setBusy(what);
    try {
      const r = await api<{ invite?: string }>("POST", what);
      if (r.invite) setInvite(r.invite);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return <p className="text-muted">Loading…</p>;
  if (!authenticated) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-[32px] font-medium tracking-[-0.02em]">Your dashboard</h1>
        <button className={`${primary} mt-8 w-full`} onClick={() => login()}>Sign in with email or Google</button>
        <p className="mt-4 text-sm text-muted">New here? <Link href="/start" className="underline">Set up CarePurse for your mum</Link></p>
      </div>
    );
  }
  if (!purse) return <p className="text-muted">{error ?? "Loading…"}</p>;

  const p = PRESETS[purse.preset];
  return (
    <div className="space-y-10">
      <section>
        <p className="text-sm text-muted">Mama {purse.mama.name}’s purse</p>
        <div className="mt-2 text-[44px] font-medium leading-none tracking-[-0.03em] tabular-nums">{naira(purse.balanceNgn ?? 0)}</div>
        <p className="mt-2 text-sm text-muted">{purse.balanceUsdc ?? 0} USDC on Stellar Testnet</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className={secondary} disabled={busy === "test-usdc" || purse.testUsdcLeft <= 0} onClick={() => act("test-usdc")}>{busy === "test-usdc" ? "Sending…" : "Get 10 test USDC"}</button>
          <a className={secondary} href={explorer("contract", purse.contractId)} target="_blank" rel="noreferrer">Purse on Stellar</a>
        </div>
      </section>

      <section className="rounded-2xl border border-line p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Mama’s invite</h2>
          <span className="text-sm text-muted">{INVITE[purse.invite.status]}</span>
        </div>
        {purse.invite.status !== "joined" && (
          <>
            {invite ? (
              <>
                <div className="mt-4 break-all rounded-[10px] bg-surface px-4 py-3 font-mono text-sm">{inviteUrl(invite)}</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button className={secondary} onClick={() => navigator.clipboard?.writeText(inviteUrl(invite)).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
                  <a className={primary} href={whatsappUrl(purse.mama.name, invite)} target="_blank" rel="noreferrer">Share on WhatsApp</a>
                </div>
              </>
            ) : (
              <button className={`${secondary} mt-4 w-full`} disabled={busy === "invite"} onClick={() => act("invite")}>{busy === "invite" ? "Making a link…" : "Send a new invite"}</button>
            )}
            <p className="mt-3 text-sm text-muted">A new link cancels the old one. Each link works once, for 7 days.</p>
          </>
        )}
      </section>

      <section>
        <h2 className="font-medium">Receipts</h2>
        {purse.spends.length === 0 ? (
          <p className="mt-3 text-secondary">Nothing bought yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {purse.spends.map((s, i) => (
              <li key={i} className="flex items-start justify-between gap-4 py-4">
                <div>
                  <div className="font-medium">{UTILITY[s.utility] ?? s.utility} {naira(s.ngn)}</div>
                  <div className="text-sm text-muted">{when(s.at)}{s.token ? ` · token ${s.token}` : ""}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="tabular-nums">Charged {naira(s.chargedNgn ?? s.ngn)}</div>
                  {s.feeNgn ? <div className="text-muted">incl. {naira(s.feeNgn)} fee</div> : null}
                  {s.tx && <a href={explorer("tx", s.tx)} target="_blank" rel="noreferrer" className="text-muted underline">Stellar</a>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-medium">Her rules · {p.label}</h2>
        <dl className="mt-3 grid grid-cols-[96px_1fr] gap-y-2 text-[15px]">
          <dt className="text-muted">Light</dt><dd>{p.electricity}, meter <span className="font-mono">{purse.destinations.electricity}</span></dd>
          <dt className="text-muted">Airtime</dt><dd>{p.airtime}, to <span className="font-mono">{purse.destinations.airtime}</span></dd>
          <dt className="text-muted">Data</dt><dd>{p.data}</dd>
          <dt className="text-muted">Month</dt><dd>up to {naira(purse.monthlyCap)}</dd>
        </dl>
        <p className="mt-3 text-sm text-muted">Enforced by the purse contract. Only your signature can change them.</p>
      </section>

      {error && <p className="rounded-[10px] bg-danger-soft px-4 py-3 text-danger">{error}</p>}
      <button className="text-sm text-muted underline" onClick={() => logout().then(() => router.push("/"))}>Sign out</button>
    </div>
  );
}

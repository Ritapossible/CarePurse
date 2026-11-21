"use client";
// The daughter's dashboard: Mama's purse at a glance, quick actions, Mama's status, activity and limits.
// The service fee shows here only (Mama never sees it).
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import AuthCard from "@/components/AuthCard";
import TokenCard from "@/components/TokenCard";
import { PRESETS, type Purse, type Spend, explorer, inviteUrl, naira, useFamilyApi, useStellarWallet, whatsappUrl } from "@/lib/family";

const LAGOS = "Africa/Lagos";
const UTILITY: Record<string, string> = { electricity: "Electricity", airtime: "Airtime", data: "Data" };
const INVITE = { none: "Not invited", waiting: "Invite sent", joined: "Active", expired: "Link expired" } as const;

// Small line icons, drawn once, in currentColor.
const ICONS = {
  electricity: "M13 2 4 14h7l-1 8 9-12h-7z",
  airtime: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  data: "M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01",
  add: "M12 5v14M5 12h14",
  invite: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13",
  limits: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  receipts: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  close: "M6 6l12 12M18 6 6 18",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
};
function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-CA", { timeZone: LAGOS });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: LAGOS });
  const time = d.toLocaleTimeString("en-NG", { timeZone: LAGOS, hour: "numeric", minute: "2-digit" });
  return day === today ? `Today, ${time}` : `${d.toLocaleDateString("en-NG", { timeZone: LAGOS, day: "numeric", month: "short" })}, ${time}`;
};
const maskPhone = (p: string) => p.replace(/\D/g, "").replace(/^(\d{4})\d+(\d{3})$/, "$1 ••• $2");

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} className="w-full max-w-md rounded-t-[24px] bg-white p-6 pb-8 sm:rounded-[24px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-foreground"><Icon d={ICONS.close} /></button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function ActivityRow({ s }: { s: Spend }) {
  return (
    <li>
      <TokenCard
        title={UTILITY[s.utility] ?? s.utility}
        token={s.utility === "electricity" ? s.token : null}
        meta={`${when(s.at)}${s.unconfirmed ? " · Checking" : ""}`}
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

export default function DashboardPage() {
  const router = useRouter();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const api = useFamilyApi();
  const [purse, setPurse] = useState<Purse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [sheet, setSheet] = useState<"fund" | "invite" | "plan" | null>(null);
  const wallet = useStellarWallet();
  const [qr, setQr] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [menu, setMenu] = useState(false);

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

  useEffect(() => {
    if (purse?.contractId) QRCode.toDataURL(purse.contractId, { margin: 1, width: 360 }).then(setQr).catch(() => {});
  }, [purse?.contractId]);

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
  // A new plan: the new caps go on-chain with one signature from her wallet, like at setup.
  async function changePlan(next: "light" | "standard") {
    setError(null);
    setBusy(`plan-${next}`);
    try {
      const prep = await api<{ status: string; hash?: string }>("POST", "limits-prepare", { preset: next });
      if (prep.status === "pending" && prep.hash) {
        const address = wallet.address ?? (await wallet.ensure());
        const { signature } = await wallet.sign(address, prep.hash);
        await api("POST", "limits-complete", { signature });
      }
      await load();
      setSheet(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const copy = (key: string, text: string) => navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); });

  if (!ready) return <p className="text-muted">Loading…</p>;
  if (!authenticated) {
    return (
      <AuthCard
        title="Sign in"
        subtitle="Sign in to see Mama’s purse, receipts and limits."
        action="Sign in"
        onAction={() => login()}
        points={["Her balance and every top-up", "Invite or re-invite Mama", "Your limits, kept on her purse"]}
        alt={{ text: "New here?", link: "Set up for your mum", href: "/start" }}
        image={{ src: "/photos/elder.jpg", alt: "An older woman in a headwrap smiling with a thumbs up", position: "50% 30%" }}
      />
    );
  }
  if (!purse) {
    return error ? <p className="rounded-[10px] bg-danger-soft px-4 py-3 text-danger">{error}</p> : (
      <div className="space-y-4" aria-label="Loading">
        <div className="h-8 w-48 animate-pulse rounded-[10px] bg-surface" />
        <div className="h-52 animate-pulse rounded-[24px] bg-surface" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }

  const preset = PRESETS[purse.preset];
  const month = purse.monthNgn ?? 0;
  const used = Math.min(100, Math.round((month / purse.monthlyCap) * 100));
  const you = purse.guardian.name || user?.email?.address?.split("@")[0] || "there";
  const spends = all ? purse.spends : purse.spends.slice(0, 5);
  const ACTIONS = [
    { key: "fund", label: "Add money", icon: ICONS.add, onClick: () => setSheet("fund") },
    { key: "invite", label: "Invite Mama", icon: ICONS.invite, onClick: () => setSheet("invite") },
    { key: "limits", label: "Limits", icon: ICONS.limits, onClick: () => setSheet("plan") },
    { key: "receipts", label: "Receipts", icon: ICONS.receipts, onClick: () => document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" }) },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Page title and account menu */}
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Dashboard</p>
          <h1 className="text-2xl font-medium">Mama {purse.mama.name}’s purse</h1>
        </div>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} aria-label="Account" className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-lg font-medium text-background">
            {you.slice(0, 1).toUpperCase()}
          </button>
          {menu && (
            <div className="absolute right-0 top-13 z-20 w-56 rounded-2xl border border-line bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{you}</p>
                <p className="truncate text-sm text-muted">{user?.email?.address ?? user?.google?.email}</p>
              </div>
              <button onClick={() => logout().then(() => router.push("/"))} className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-surface">Sign out</button>
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
      <div className="space-y-8">
      {/* Balance card */}
      <section className="rounded-[24px] bg-foreground p-6 text-background">
        <div className="flex items-center justify-between text-sm text-background/60">
          <span className="inline-flex items-center gap-2">
            Balance
            <button onClick={() => setHidden((h) => !h)} aria-label={hidden ? "Show balance" : "Hide balance"} className="text-background/60 hover:text-background">
              <Icon d={hidden ? ICONS.eyeOff : ICONS.eye} className="h-4 w-4" />
            </button>
          </span>
          {purse.paused ? <span className="text-xs text-background">Paused</span> : <span className="inline-flex items-center gap-1.5 text-xs"><span className="h-1.5 w-1.5 rounded-full bg-live" />Active</span>}
        </div>
        <div className="mt-3 text-[44px] font-medium leading-none tracking-[-0.02em] tabular-nums">{hidden ? "₦ ••••••" : naira(purse.balanceNgn ?? 0)}</div>
        {purse.rate && !hidden && (
          <p className="mt-2 text-sm text-background/60 tabular-nums">{purse.balanceUsdc ?? 0} USDC · ₦{purse.rate.ngnPerUsdc.toLocaleString("en-NG")} per USDC{purse.rate.live ? " (today’s rate)" : ""}</p>
        )}
        <div className="mt-6">
          <div className="flex justify-between text-sm">
            <span className="text-background/60">Spent this month</span>
            <span className="tabular-nums">{hidden ? "••••" : naira(month)} <span className="text-background/50">of {naira(purse.monthlyCap)}</span></span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/15">
            <div className="h-full rounded-full bg-background" style={{ width: `${used}%` }} />
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-4 gap-3">
        {ACTIONS.map((a) => (
          <button key={a.key} onClick={a.onClick} className="group flex flex-col items-center gap-2">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-white transition-colors duration-150 group-hover:border-foreground"><Icon d={a.icon} /></span>
            <span className="text-[13px] font-medium">{a.label}</span>
          </button>
        ))}
      </section>

      {/* Mama */}
      <section className="flex items-center gap-4 rounded-2xl border border-line p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface text-lg font-medium">{purse.mama.name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">Mama {purse.mama.name}</div>
          <div className="text-sm text-muted">{maskPhone(purse.mama.phone)} · Meter •••{purse.destinations.electricity.slice(-4)}</div>
        </div>
        {purse.invite.status === "joined" ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-live" />{INVITE.joined}</span>
        ) : (
          <button onClick={() => setSheet("invite")} className="h-9 rounded-[10px] border border-foreground px-3 text-sm font-medium">{purse.invite.status === "waiting" ? "Resend" : "Invite"}</button>
        )}
      </section>

      </div>
      <div className="space-y-8">
      {/* Activity */}
      <section id="activity" className="scroll-mt-24">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Recent activity</h2>
          {purse.spends.length > 5 && <button onClick={() => setAll((a) => !a)} className="text-sm text-muted hover:text-foreground">{all ? "Show less" : "View all"}</button>}
        </div>
        {purse.spends.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <p className="font-medium">No top-ups yet</p>
            <p className="mt-1 text-sm text-muted">When Mama asks Mhasibu AI for light, airtime or data, it shows here</p>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">{spends.map((s, i) => <ActivityRow key={`${s.at}-${i}`} s={s} />)}</ul>
        )}
      </section>

      {/* Limits */}
      <section id="limits" className="scroll-mt-24">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Limits</h2>
          <button onClick={() => setSheet("plan")} className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">{preset.label} plan · Change</button>
        </div>
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
          {(["electricity", "airtime", "data"] as const).map((u) => (
            <li key={u} className="flex items-center gap-4 px-4 py-4">
              <Icon d={ICONS[u]} className="h-5 w-5 text-muted" />
              <span className="flex-1 font-medium">{UTILITY[u]}</span>
              <span className="text-sm text-secondary">{preset[u]}</span>
            </li>
          ))}
          <li className="flex items-center justify-between px-4 py-4">
            <span className="font-medium">Monthly total</span>
            <span className="text-sm text-secondary">up to {naira(purse.monthlyCap)}</span>
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted">Kept on Mama’s purse itself. Only your signature can change them.</p>
      </section>

      </div>
      </div>

      {error && <p className="rounded-[10px] bg-danger-soft px-4 py-3 text-danger">{error}</p>}

      <p className="border-t border-line pt-6 text-xs text-muted">
        Purse ID <span className="font-mono">{purse.contractId.slice(0, 6)}…{purse.contractId.slice(-4)}</span> ·{" "}
        <a href={explorer("contract", purse.contractId)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">View details</a>
      </p>

      {sheet === "fund" && (
        <Sheet title="Add money" onClose={() => setSheet(null)}>
          <p className="text-sm text-secondary">Send USDC on Stellar to Mama’s purse. It’s ready for her as soon as it lands.{purse.rate ? ` 1 USDC ≈ ₦${purse.rate.ngnPerUsdc.toLocaleString("en-NG")}${purse.rate.live ? " at today’s rate" : ""}.` : ""}</p>
          {qr && <img src={qr} alt="QR code of Mama’s purse address" width={180} height={180} className="mx-auto mt-5 rounded-xl border border-line" />}
          <button onClick={() => copy("address", purse.contractId)} className="mt-5 flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-3 text-left">
            <span className="min-w-0 flex-1 break-all font-mono text-[13px]">{purse.contractId}</span>
            <span className="shrink-0 text-sm font-medium">{copied === "address" ? "Copied" : "Copy"}</span>
          </button>
          <div className="mt-5 border-t border-line pt-5">
            <p className="text-sm text-muted">Testing? Add 10 test dollars ({purse.testUsdcLeft} left).</p>
            <button disabled={busy === "test-usdc" || purse.testUsdcLeft <= 0} onClick={() => act("test-usdc")} className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-foreground font-medium text-background disabled:opacity-40">
              {busy === "test-usdc" ? "Adding…" : "Add test money"}
            </button>
          </div>
        </Sheet>
      )}

      {sheet === "plan" && (
        <Sheet title="Her plan" onClose={() => setSheet(null)}>
          <p className="text-sm text-secondary">Switch any time. The new limits are saved on Mama’s purse with one approval from you.</p>
          <div className="mt-5 space-y-3">
            {(["light", "standard"] as const).map((k) => {
              const p = PRESETS[k];
              const current = purse.preset === k;
              return (
                <button
                  key={k}
                  disabled={current || Boolean(busy)}
                  onClick={() => changePlan(k)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors duration-150 ${current ? "border-foreground" : "border-line hover:border-foreground"} disabled:cursor-default`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-sm text-muted">{current ? "Current plan" : busy === `plan-${k}` ? "Saving on Stellar…" : `up to ${naira(p.monthly)} a month`}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                    <dt className="text-muted">Light</dt><dd>{p.electricity}</dd>
                    <dt className="text-muted">Airtime</dt><dd>{p.airtime}</dd>
                    <dt className="text-muted">Data</dt><dd>{p.data}</dd>
                  </dl>
                </button>
              );
            })}
          </div>
          {error && <p className="mt-4 rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
        </Sheet>
      )}

      {sheet === "invite" && (
        <Sheet title={`Invite Mama ${purse.mama.name}`} onClose={() => setSheet(null)}>
          {purse.invite.status === "joined" ? (
            <p className="text-secondary">Mama has joined. She chats with Mhasibu AI from her phone.</p>
          ) : invite ? (
            <>
              <p className="text-sm text-secondary">Send her this link. It works once, for 7 days.</p>
              <button onClick={() => copy("invite", inviteUrl(invite))} className="mt-4 flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-3 text-left">
                <span className="min-w-0 flex-1 break-all font-mono text-[13px]">{inviteUrl(invite)}</span>
                <span className="shrink-0 text-sm font-medium">{copied === "invite" ? "Copied" : "Copy"}</span>
              </button>
              <a href={whatsappUrl(purse.mama.name, invite)} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-foreground font-medium text-background">Share on WhatsApp</a>
            </>
          ) : (
            <>
              <p className="text-sm text-secondary">{purse.invite.status === "waiting" ? "A link was sent but not used yet. A new link cancels the old one." : "Make a link for Mama. She signs in with her phone number."}</p>
              <button disabled={busy === "invite"} onClick={() => act("invite")} className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-foreground font-medium text-background disabled:opacity-40">
                {busy === "invite" ? "Making a link…" : "Create invite link"}
              </button>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}

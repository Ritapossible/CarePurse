"use client";
// The daughter's dashboard: Mama's purse at a glance, quick actions, Mama's status, activity and limits.
// The service fee shows here only (Mama never sees it).
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import AuthCard from "@/components/AuthCard";
import Link from "next/link";
import ActivityRow, { UTILITY, when } from "@/components/ActivityRow";
import { PRESETS, type Purse, type Spend, explorer, inviteUrl, naira, useFamilyApi, useStellarWallet, whatsappUrl } from "@/lib/family";

const INVITE = { none: "Not invited", waiting: "Invite sent", joined: "Active", expired: "Link expired" } as const;

// Small line icons, drawn once, in currentColor.
const ICONS = {
  electricity: "M13 2 4 14h7l-1 8 9-12h-7z",
  airtime: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  data: "M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01",
  add: "M12 5v14M5 12h14",
  withdraw: "M12 3v12M7 10l5 5 5-5M5 21h14",
  pause: "M9 5v14M15 5v14",
  play: "M7 5l12 7-12 7z",
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

export default function DashboardPage() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const api = useFamilyApi();
  const [purse, setPurse] = useState<Purse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [sheet, setSheet] = useState<"fund" | "invite" | "plan" | "withdraw" | null>(null);
  const [wAmount, setWAmount] = useState("");
  const [wTo, setWTo] = useState<"me" | "other">("me");
  const [wAddress, setWAddress] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const wallet = useStellarWallet();
  const [qr, setQr] = useState<string | null>(null);

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
  // Pause, resume and withdraw: the backend prepares each step, her wallet signs it. A first
  // withdrawal to her own wallet has two steps (the wallet opts in to USDC, then the withdrawal).
  const STEP_LABEL: Record<string, string> = {
    pause: "Approve pausing the purse",
    unpause: "Approve resuming the purse",
    trustline: "Approve 1 of 2: let your wallet receive USDC",
    withdraw: "Approve the withdrawal",
  };
  async function approveSteps(first: { status: string; kind?: string; hash?: string }) {
    let r = first;
    const address = wallet.address ?? (await wallet.ensure());
    while (r.status === "pending" && r.hash) {
      setStep(STEP_LABEL[r.kind ?? ""] ?? "Approve in your wallet");
      const { signature } = await wallet.sign(address, r.hash);
      setStep("Saving on Stellar…");
      r = await api<{ status: string; kind?: string; hash?: string }>("POST", "action-complete", { signature });
    }
    return r;
  }
  async function togglePause() {
    if (!purse) return;
    setError(null);
    setBusy("pause");
    try {
      await approveSteps(await api("POST", "pause", { paused: !purse.paused }));
      setNotice(purse.paused ? "Purse resumed. Mhasibu AI can buy again." : "Purse paused. Mhasibu AI won’t buy anything until you resume.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setStep(null);
    }
  }
  async function withdraw() {
    setError(null);
    setBusy("withdraw");
    try {
      const r = await approveSteps(await api("POST", "withdraw", { usdc: Number(wAmount), to: wTo === "other" ? wAddress.trim() : undefined }));
      if (r.status === "done") {
        setNotice(`Withdrew ${Number(wAmount)} USDC.`);
        setWAmount("");
        setSheet(null);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setStep(null);
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
      setNotice(next === purse?.preset ? "Rules updated to today’s rate." : `Switched to the ${PRESETS[next].label} plan.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);
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
  const spends = purse.spends.slice(0, 3);
  const rowIcon = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface";
  const rowButton = "h-9 shrink-0 rounded-[10px] border border-line px-3.5 text-sm font-medium transition-colors duration-150 hover:border-foreground disabled:opacity-40";
  const joined = purse.invite.status === "joined";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Dashboard</p>
          <h1 className="mt-1 text-2xl font-medium tracking-[-0.01em]">Mama {purse.mama.name}’s purse</h1>
        </div>
        {purse.paused ? (
          <span className="inline-flex h-8 items-center gap-2 rounded-full bg-surface px-3 text-sm text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-muted" />Paused</span>
        ) : (
          <span className="inline-flex h-8 items-center gap-2 rounded-full bg-surface px-3 text-sm text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-live" />Active</span>
        )}
      </header>

      {purse.rulesBehind && (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Update Mama’s rules to today’s rate</p>
            <p className="mt-0.5 text-sm text-secondary">The naira moved since her plan was saved, so some top-ups within her limits could be refused. One approval fixes it.</p>
          </div>
          <button disabled={Boolean(busy)} onClick={() => changePlan(purse.preset as "light" | "standard")} className="inline-flex h-10 shrink-0 items-center justify-center rounded-[10px] bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40">
            {busy === `plan-${purse.preset}` ? "Saving on Stellar…" : "Update rules"}
          </button>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
        <div className="space-y-6">
          {/* Balance, with the two money actions */}
          <section className="rounded-[24px] bg-foreground p-6 text-background">
            <div className="flex items-center gap-2 text-sm text-background/60">
              Balance
              <button onClick={() => setHidden((h) => !h)} aria-label={hidden ? "Show balance" : "Hide balance"} className="text-background/60 hover:text-background">
                <Icon d={hidden ? ICONS.eyeOff : ICONS.eye} className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 text-[40px] font-medium leading-none tracking-[-0.02em] tabular-nums sm:text-[44px]">{hidden ? "₦ ••••••" : naira(purse.balanceNgn ?? 0)}</div>
            {!hidden && purse.spendableNgn != null && purse.feeBps ? (
              <p className="mt-2 text-sm text-background/80 tabular-nums">Mama can spend {naira(purse.spendableNgn)} after your {purse.feeBps / 100}% fee</p>
            ) : null}
            {purse.rate && !hidden && (
              <p className="mt-1 text-[13px] text-background/50 tabular-nums">{Number(purse.balanceUsdc ?? 0).toFixed(2)} USDC · ₦{purse.rate.ngnPerUsdc.toLocaleString("en-NG")} per USDC{purse.rate.live ? " today" : ""}</p>
            )}
            <div className="mt-6">
              <div className="flex justify-between text-sm">
                <span className="text-background/60">Spent this month</span>
                <span className="tabular-nums">{hidden ? "••••" : naira(month)} <span className="text-background/50">of {naira(purse.monthlyCap)}</span></span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/15">
                <div className="h-full rounded-full bg-background" style={{ width: `${Math.max(used, month > 0 ? 2 : 0)}%` }} />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => setSheet("fund")} className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-background text-sm font-medium text-foreground transition-opacity duration-150 hover:opacity-90">
                <Icon d={ICONS.add} className="h-4 w-4" />Add money
              </button>
              <button onClick={() => { setError(null); setSheet("withdraw"); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-background/10 text-sm font-medium text-background transition-colors duration-150 hover:bg-background/20">
                <Icon d={ICONS.withdraw} className="h-4 w-4" />Withdraw
              </button>
            </div>
          </section>

          {/* Mama and the purse's controls, as one list */}
          <section className="divide-y divide-line rounded-2xl border border-line bg-white">
            <div className="flex items-center gap-4 p-4">
              <span className={`${rowIcon} text-base font-medium`}>{purse.mama.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Mama {purse.mama.name}</div>
                <div className="truncate text-sm text-muted">{maskPhone(purse.mama.phone)} · Meter •••{purse.destinations.electricity.slice(-4)}</div>
              </div>
              <span className="shrink-0 text-sm text-secondary">{INVITE[purse.invite.status]}</span>
            </div>
            <div className="flex items-center gap-4 p-4">
              <span className={rowIcon}><Icon d={ICONS.invite} className="h-[18px] w-[18px]" /></span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Sign-in link</div>
                <div className="text-sm text-muted">{joined ? "A new link signs her out elsewhere" : "Works once, for 7 days"}</div>
              </div>
              <button onClick={() => setSheet("invite")} className={rowButton}>{joined ? "New link" : purse.invite.status === "waiting" ? "Resend" : "Invite"}</button>
            </div>
            <div className="flex items-center gap-4 p-4">
              <span className={rowIcon}><Icon d={purse.paused ? ICONS.play : ICONS.pause} className="h-[18px] w-[18px]" /></span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Top-ups</div>
                <div className="text-sm text-muted">{busy === "pause" && step ? step : purse.paused ? "Paused until you resume" : "Mhasibu AI can buy for her"}</div>
              </div>
              <button onClick={togglePause} disabled={Boolean(busy)} className={purse.paused ? `${rowButton} border-foreground bg-foreground text-background` : rowButton}>
                {busy === "pause" ? "Approving…" : purse.paused ? "Resume" : "Pause"}
              </button>
            </div>
            <div className="flex items-center gap-4 p-4">
              <span className={rowIcon}><Icon d={ICONS.limits} className="h-[18px] w-[18px]" /></span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{preset.label} plan</div>
                <div className="text-sm text-muted">Up to {naira(purse.monthlyCap)} a month</div>
              </div>
              <button onClick={() => setSheet("plan")} className={rowButton}>Change</button>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {/* Activity */}
          <section id="activity" className="scroll-mt-24">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium">Recent activity</h2>
              {purse.spends.length > 0 && (
                <Link href="/activity" className="text-sm text-muted underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline">See all</Link>
              )}
            </div>
            {purse.spends.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
                <p className="font-medium">No top-ups yet</p>
                <p className="mt-1 text-sm text-muted">When Mama asks Mhasibu AI for light, airtime or data, it shows here</p>
              </div>
            ) : (
              <>
                <ul className="mt-3 space-y-3">{spends.map((s, i) => <ActivityRow key={`${s.at}-${i}`} s={s} />)}</ul>
                {purse.spends.length > spends.length && (
                  <Link href="/activity" className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-white text-sm font-medium transition-colors duration-150 hover:border-foreground">
                    See all activity
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </Link>
                )}
              </>
            )}
          </section>

          {/* Limits */}
          <section id="limits" className="scroll-mt-24">
            <h2 className="text-lg font-medium">Limits</h2>
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
              {(["electricity", "airtime", "data"] as const).map((u) => (
                <li key={u} className="flex items-center gap-3 px-4 py-3.5">
                  <Icon d={ICONS[u]} className="h-[18px] w-[18px] shrink-0 text-muted" />
                  <span className="w-24 shrink-0 font-medium">{UTILITY[u]}</span>
                  <span className="min-w-0 flex-1 text-right text-sm text-secondary">{preset[u]}</span>
                </li>
              ))}
              <li className="flex items-center justify-between px-4 py-3.5">
                <span className="font-medium">Monthly total</span>
                <span className="text-sm text-secondary">up to {naira(purse.monthlyCap)}</span>
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted">Saved on Mama’s purse on Stellar. Only your approval can change them.</p>
          </section>
        </div>
      </div>

      {notice && (
        <div role="status" className="fixed inset-x-4 bottom-6 z-40 mx-auto max-w-sm rounded-2xl bg-foreground px-4 py-3 text-center text-sm text-background shadow-[0_8px_24px_rgba(0,0,0,0.18)]">{notice}</div>
      )}

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

      {sheet === "withdraw" && (
        <Sheet title="Withdraw" onClose={() => setSheet(null)}>
          <p className="text-sm text-secondary">Move money out of Mama’s purse. Only you can do this, with your approval.</p>
          <label className="mt-5 block text-sm text-secondary">
            Amount in USDC
            <div className="mt-2 flex gap-2">
              <input value={wAmount} onChange={(e) => setWAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="0.00" className="h-12 min-w-0 flex-1 rounded-[10px] border border-line px-4 text-[17px] tabular-nums outline-none focus:border-foreground" />
              <button type="button" onClick={() => setWAmount(String(purse.balanceUsdc ?? 0))} className="h-12 shrink-0 rounded-[10px] border border-line px-4 text-sm font-medium hover:border-foreground">Max</button>
            </div>
          </label>
          <p className="mt-2 text-sm text-muted tabular-nums">
            {Number(wAmount) > 0 && purse.rate ? `≈ ${naira(Number(wAmount) * purse.rate.ngnPerUsdc)} · ` : ""}In the purse: {purse.balanceUsdc ?? 0} USDC
          </p>
          <fieldset className="mt-5 space-y-2">
            <legend className="text-sm text-secondary">Send to</legend>
            {([["me", "My CarePurse wallet", `${purse.guardian.address.slice(0, 6)}…${purse.guardian.address.slice(-4)}`], ["other", "Another Stellar address", "It must already accept USDC"]] as const).map(([v, l, d]) => (
              <button key={v} type="button" onClick={() => setWTo(v)} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${wTo === v ? "border-foreground" : "border-line hover:border-foreground"}`}>
                <span className="font-medium">{l}</span>
                <span className={`text-xs text-muted ${v === "me" ? "font-mono" : ""}`}>{d}</span>
              </button>
            ))}
            {wTo === "other" && (
              <input value={wAddress} onChange={(e) => setWAddress(e.target.value.trim().toUpperCase())} placeholder="G… or C… address" aria-label="Stellar address" className="h-12 w-full rounded-[10px] border border-line px-4 font-mono text-sm outline-none focus:border-foreground" />
            )}
          </fieldset>
          {error && <p className="mt-4 rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <button
            disabled={Boolean(busy) || !(Number(wAmount) > 0) || (wTo === "other" && wAddress.length !== 56)}
            onClick={withdraw}
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-foreground font-medium text-background disabled:opacity-40"
          >
            {busy === "withdraw" ? step ?? "Preparing…" : "Withdraw"}
          </button>
          {(purse.withdrawals?.length ?? 0) > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <p className="text-sm text-muted">Recent withdrawals</p>
              <ul className="mt-2 space-y-2 text-sm">
                {purse.withdrawals!.slice(0, 3).map((w) => (
                  <li key={w.tx} className="flex justify-between gap-3">
                    <span className="tabular-nums">{w.usdc} USDC · {when(w.at)}</span>
                    <a href={explorer("tx", w.tx)} target="_blank" rel="noreferrer" className="text-muted underline-offset-4 hover:underline">Receipt</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Sheet>
      )}

      {sheet === "plan" && (
        <Sheet title="Her plan" onClose={() => setSheet(null)}>
          <p className="text-sm text-secondary">Switch any time, or re-save your plan when the naira rate moves a lot. The limits are saved on Mama’s purse with one approval from you.</p>
          <div className="mt-5 space-y-3">
            {(["light", "standard"] as const).map((k) => {
              const p = PRESETS[k];
              const current = purse.preset === k;
              return (
                <button
                  key={k}
                  disabled={Boolean(busy)}
                  onClick={() => changePlan(k)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors duration-150 ${current ? "border-foreground" : "border-line hover:border-foreground"} disabled:cursor-default`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-sm text-muted">{busy === `plan-${k}` ? "Saving on Stellar…" : current ? "Current plan · tap to re-save at today’s rate" : `up to ${naira(p.monthly)} a month`}</span>
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

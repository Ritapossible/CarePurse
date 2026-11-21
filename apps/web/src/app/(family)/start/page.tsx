"use client";
// The daughter's sign-up (SIGNUP.md): sign in, Mama, where the money goes, limits, then fund and
// invite. Her Privy wallet becomes the purse's guardian; she approves the rules once.
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import AuthCard from "@/components/AuthCard";
import { DISCOS, NETWORKS, PRESETS, type Purse, explorer, inviteUrl, naira, useFamilyApi, useStellarWallet, whatsappUrl } from "@/lib/family";

type Step = "signin" | "mama" | "meter" | "limits" | "fund" | "invite";

const input = "mt-2 h-12 w-full rounded-[10px] border border-line bg-background px-4 text-[17px] outline-none transition-colors duration-150 focus:border-foreground";
const primary = "inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-foreground px-5 font-medium text-background transition-colors duration-150 hover:bg-[#2b2825] disabled:opacity-40";
const secondary = "inline-flex h-12 w-full items-center justify-center rounded-[10px] border border-line px-5 font-medium transition-colors duration-150 hover:bg-surface disabled:opacity-40";

function Heading({ step, title, text }: { step?: string; title: string; text?: string }) {
  return (
    <div className="mb-8">
      {step && <p className="text-sm text-muted">{step}</p>}
      <h1 className="mt-2 text-[32px] font-medium leading-tight">{title}</h1>
      {text && <p className="mt-3 text-secondary">{text}</p>}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="mt-4 rounded-[10px] bg-danger-soft px-4 py-3 text-danger">{error}</p> : null;
}

export default function StartPage() {
  const router = useRouter();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const api = useFamilyApi();
  const wallet = useStellarWallet();
  const [step, setStep] = useState<Step>("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [you, setYou] = useState("");
  const [mamaName, setMamaName] = useState("");
  const [phone, setPhone] = useState("");
  const [meter, setMeter] = useState("");
  const [disco, setDisco] = useState("ikeja-electric");
  const [network, setNetwork] = useState("mtn");
  const [owner, setOwner] = useState<string | null>(null);
  const [preset, setPreset] = useState<"light" | "standard">("standard");
  const [purse, setPurse] = useState<Purse | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Signed in: already set up → dashboard. Otherwise make sure she has a Stellar wallet.
  useEffect(() => {
    if (!ready || !authenticated) return;
    let gone = false;
    (async () => {
      try {
        const { purse: p } = await api<{ purse: Purse | null }>("GET", "purse");
        if (gone) return;
        if (p?.status === "active" && step === "signin") return router.replace("/dashboard");
        await wallet.ensure();
        if (!gone && step === "signin") setStep("mama");
      } catch (e) {
        if (!gone) setError((e as Error).message);
      }
    })();
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  useEffect(() => {
    if (purse?.contractId) QRCode.toDataURL(purse.contractId, { margin: 1, width: 220 }).then(setQr).catch(() => {});
  }, [purse?.contractId]);

  async function checkMeter() {
    setError(null);
    setOwner(null);
    setBusy("meter");
    try {
      const r = await api<{ ok: boolean; ownerName: string | null; reason: string | null }>("POST", "meter", { meter, disco });
      if (!r.ok) throw new Error(r.reason ?? "The electricity company didn’t recognise this meter.");
      setOwner(r.ownerName ?? "Meter found");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function createPurse() {
    setError(null);
    try {
      setBusy("Creating Mama’s purse on Stellar…");
      const address = await wallet.ensure();
      const email = user?.email?.address ?? user?.google?.email ?? null;
      const prep = await api<{ status: string; hash?: string }>("POST", "prepare", {
        guardian: { address, name: you, email }, mama: { name: mamaName, phone }, meter, disco, network, preset,
      });
      if (prep.status === "pending" && prep.hash) {
        setBusy("Approve your rules…");
        const { signature } = await wallet.sign(address, prep.hash);
        setBusy("Saving your rules on Stellar…");
        const done = await api<{ invite?: string }>("POST", "complete", { signature });
        if (done.invite) setInvite(done.invite);
      }
      const { purse: p } = await api<{ purse: Purse }>("GET", "purse");
      setPurse(p);
      setStep("fund");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function testUsdc() {
    setError(null);
    setBusy("usdc");
    try {
      await api("POST", "test-usdc");
      setPurse((await api<{ purse: Purse }>("GET", "purse")).purse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return <p className="text-muted">Loading…</p>;
  return (
    <div className="mx-auto max-w-xl">
      {authenticated && step !== "signin" && (
        <div className="mb-8 flex items-center justify-between gap-4 border-b border-line pb-4 text-sm">
          <span className="min-w-0 truncate text-muted">Signed in as <span className="text-foreground">{user?.email?.address ?? user?.google?.email ?? "your account"}</span></span>
          <button className="shrink-0 text-muted underline transition-colors duration-150 hover:text-foreground" disabled={Boolean(busy && busy !== "meter" && busy !== "usdc")} onClick={() => logout().then(() => router.push("/"))}>Sign out</button>
        </div>
      )}
      {body()}
    </div>
  );

  function body() {

  if (!authenticated || step === "signin") {
    return (
      <AuthCard
        title="Set up CarePurse"
        subtitle="Electricity, airtime and data for your mum, within limits you set."
        action={authenticated ? "Getting your account ready" : "Get started"}
        busy={authenticated}
        onAction={() => login()}
        points={["Takes about three minutes", "Only you can change her limits", "Mama just chats. No app to learn"]}
        alt={{ text: "Already set up?", link: "Sign in", href: "/dashboard" }}
        image={{ src: "/photos/embrace.jpg", alt: "A mother and her daughter hugging, smiling", position: "50% 30%" }}
        error={error}
      />
    );
  }

  if (step === "mama") {
    const ok = you.trim() && mamaName.trim() && phone.replace(/\D/g, "").length >= 10;
    return (
      <>
        <Heading step="Step 1 of 4" title="About Mama" text="Airtime and data go to this phone number. Mama signs in with it too." />
        <label className="block text-sm text-secondary">Your first name<input className={input} value={you} onChange={(e) => setYou(e.target.value)} placeholder="Adaeze" /></label>
        <label className="mt-5 block text-sm text-secondary">Mama’s name<input className={input} value={mamaName} onChange={(e) => setMamaName(e.target.value)} placeholder="Ngozi" /></label>
        <label className="mt-5 block text-sm text-secondary">Mama’s phone number<input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0803 123 4567" /></label>
        <label className="mt-5 block text-sm text-secondary">Network
          <select className={input} value={network} onChange={(e) => setNetwork(e.target.value)}>{NETWORKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <p className="mt-5 text-sm text-muted">Mama can write in English or Pidgin. Mhasibu AI answers in the one she uses.</p>
        <button className={`${primary} mt-8`} disabled={!ok} onClick={() => setStep("meter")}>Continue</button>
      </>
    );
  }

  if (step === "meter") {
    return (
      <>
        <Heading step="Step 2 of 4" title="Mama’s meter" text="Electricity only ever goes to this meter. We check the name on it so you know it’s hers." />
        <label className="block text-sm text-secondary">Electricity company
          <select className={input} value={disco} onChange={(e) => { setDisco(e.target.value); setOwner(null); }}>{DISCOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="mt-5 block text-sm text-secondary">Meter number
          <input className={`${input} font-mono`} value={meter} onChange={(e) => { setMeter(e.target.value.replace(/\D/g, "")); setOwner(null); }} inputMode="numeric" placeholder="11 to 13 digits" />
        </label>
        {owner ? (
          <div className="mt-5 rounded-[10px] border border-foreground px-4 py-3">
            <div className="text-sm text-muted">Name on the meter</div>
            <div className="mt-1 font-medium">{owner}</div>
          </div>
        ) : (
          <button className={`${secondary} mt-5`} disabled={meter.length < 11 || busy === "meter"} onClick={checkMeter}>{busy === "meter" ? "Checking…" : "Check meter"}</button>
        )}
        <ErrorLine error={error} />
        <button className={`${primary} mt-8`} disabled={!owner} onClick={() => setStep("limits")}>That’s Mama’s meter</button>
        <button className="mt-3 w-full py-2 text-sm text-muted hover:text-foreground" onClick={() => setStep("mama")}>Back</button>
      </>
    );
  }

  if (step === "limits") {
    return (
      <>
        <Heading step="Step 3 of 4" title="Her limits" text="Mhasibu AI can never spend more than this. The limits live in Mama’s purse contract on Stellar, and only you can change them." />
        <div className="space-y-3">
          {(["light", "standard"] as const).map((k) => {
            const p = PRESETS[k];
            return (
              <button key={k} type="button" onClick={() => setPreset(k)} className={`w-full rounded-2xl border p-5 text-left transition-colors duration-150 ${preset === k ? "border-foreground" : "border-line hover:bg-surface"}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-medium">{p.label}</span>
                  <span className="text-sm text-muted">up to {naira(p.monthly)} a month</span>
                </div>
                <dl className="mt-3 grid grid-cols-[96px_1fr] gap-y-1 text-[15px]">
                  <dt className="text-muted">Light</dt><dd>{p.electricity}</dd>
                  <dt className="text-muted">Airtime</dt><dd>{p.airtime}</dd>
                  <dt className="text-muted">Data</dt><dd>{p.data}</dd>
                </dl>
              </button>
            );
          })}
        </div>
        <ErrorLine error={error} />
        <button className={`${primary} mt-8`} disabled={Boolean(busy)} onClick={createPurse}>{busy ?? "Create Mama’s purse"}</button>
        {!busy && <p className="mt-3 text-center text-sm text-muted">You’ll approve the rules once in Privy. We pay the network fee.</p>}
        {!busy && <button className="mt-1 w-full py-2 text-sm text-muted hover:text-foreground" onClick={() => setStep("meter")}>Back</button>}
      </>
    );
  }

  if (step === "fund" && purse) {
    return (
      <>
        <Heading step="Step 4 of 4" title="Fund Mama’s purse" text="Send USDC on Stellar to this address. On testnet, use test USDC." />
        <div className="rounded-2xl border border-line p-5">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Balance</span>
            <span>{purse.balanceUsdc ?? 0} USDC</span>
          </div>
          <div className="mt-1 text-[32px] font-medium tabular-nums">{naira(purse.balanceNgn ?? 0)}</div>
          {purse.rate && <div className="mt-1 text-sm text-muted tabular-nums">1 USDC = ₦{purse.rate.ngnPerUsdc.toLocaleString("en-NG")}{purse.rate.live ? " (today’s rate)" : ""}</div>}
          {qr && <img src={qr} alt="QR code of the purse address" width={176} height={176} className="mx-auto mt-4" />}
          <div className="mt-4 break-all rounded-[10px] bg-surface px-4 py-3 font-mono text-sm">{purse.contractId}</div>
          <a href={explorer("contract", purse.contractId)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-muted underline">See it on Stellar</a>
        </div>
        <button className={`${secondary} mt-5`} disabled={busy === "usdc" || purse.testUsdcLeft <= 0} onClick={testUsdc}>{busy === "usdc" ? "Sending…" : "Get 10 test USDC"}</button>
        <ErrorLine error={error} />
        <button className={`${primary} mt-8`} onClick={() => setStep("invite")}>Continue</button>
      </>
    );
  }

  if (step === "invite") {
    const name = purse?.mama.name ?? mamaName;
    return (
      <>
        <Heading title={`Invite Mama ${name}`} text="Send her this link. It works once and expires in 7 days. She signs in with her phone number." />
        {invite ? (
          <>
            <div className="break-all rounded-[10px] bg-surface px-4 py-3 font-mono text-sm">{inviteUrl(invite)}</div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button className={secondary} onClick={() => navigator.clipboard?.writeText(inviteUrl(invite)).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
              <a className={primary} href={whatsappUrl(name, invite)} target="_blank" rel="noreferrer">Share on WhatsApp</a>
            </div>
          </>
        ) : (
          <p className="text-secondary">You can send Mama a link from your dashboard</p>
        )}
        <button className="mt-8 w-full py-2 font-medium underline" onClick={() => router.push("/dashboard")}>Go to your dashboard</button>
      </>
    );
  }

  return null;
  }
}

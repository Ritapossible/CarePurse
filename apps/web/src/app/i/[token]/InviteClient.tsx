"use client";
// Mama's invite (M1): she types her phone number (the link shows only how it ends), taps Send code,
// types the 6 digits from her text message, and her chat opens. In the demo the code is also shown.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LogoMark from "@/components/LogoMark";

type Invite = { mamaName: string; guardianName: string; phoneHint: string; language: "en" | "pcm"; codeBySms: boolean };

const input = "mt-2 h-14 w-full rounded-[10px] border border-line bg-background px-4 text-xl outline-none transition-colors duration-150 focus:border-foreground";
const primary = "inline-flex h-14 w-full items-center justify-center rounded-[10px] bg-foreground px-5 text-lg font-medium text-background transition-colors duration-150 hover:bg-[#2b2825] disabled:opacity-40";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

export default function InviteClient({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [phone, setPhone] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [bySms, setBySms] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${token}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.error ?? "This link isn’t valid. Ask your child to send a new one.");
      setInvite(d);
    }).catch(() => setError("Mhasibu AI is not reachable right now."));
  }, [token]);

  const pcm = invite?.language === "pcm";

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      const r = await post<{ code?: string; via?: string }>(`/api/invite/${token}/code`, { phone });
      setShown(r.code ?? null);
      setBySms(r.via === "sms");
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      await post(`/api/invite/${token}/verify`, { phone, code });
      router.replace("/chat");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-12 pt-10">
      <div className="flex items-center gap-2 text-lg font-medium"><LogoMark className="h-7 w-7" />CarePurse</div>
      {!invite ? (
        <p className="mt-16 text-lg text-secondary">{error ?? "Opening your link…"}</p>
      ) : (
        <>
          <h1 className="mt-14 text-4xl font-medium leading-tight">Welcome, Mama {invite.mamaName}</h1>
          <p className="mt-3 text-lg text-secondary">
            {pcm ? `${invite.guardianName} don set up CarePurse for you. Confirm your phone number to start.` : `${invite.guardianName} has set up CarePurse for you. Confirm your phone number to start.`}
          </p>
          <label className="mt-10 block text-secondary">{pcm ? "Your phone number" : "Your phone number"}
            <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" disabled={sent} />
          </label>
          <p className="mt-2 text-sm text-muted">{pcm ? `The number wey end with ${invite.phoneHint.slice(-4)}` : `The number ending in ${invite.phoneHint.slice(-4)}`}</p>
          {!sent ? (
            <button className={`${primary} mt-6`} disabled={busy || !phone} onClick={sendCode}>{busy ? "Sending…" : "Send code"}</button>
          ) : (
            <>
              {bySms && <p className="mt-6 text-secondary">{pcm ? "We don send code to your phone by text message." : "We sent a code to your phone by text message."}</p>}
              {shown && (
                <div className="mt-6 rounded-[10px] border border-foreground px-4 py-3">
                  <div className="text-sm text-muted">Your code (shown here in the demo)</div>
                  <div className="mt-1 font-mono text-[28px] font-semibold tracking-[0.2em]">{shown}</div>
                </div>
              )}
              <label className="mt-6 block text-secondary">{pcm ? "Type the 6 numbers" : "Type the 6-digit code"}
                <input className={`${input} font-mono tracking-[0.3em]`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
              </label>
              <button className={`${primary} mt-6`} disabled={busy || code.length !== 6} onClick={verify}>{busy ? "Opening…" : "Continue"}</button>
              <button className="mt-3 w-full py-2 text-sm text-muted underline-offset-4 hover:underline disabled:opacity-40" disabled={busy} onClick={() => { setSent(false); setCode(""); setShown(null); }}>{pcm ? "Send another code" : "Send another code"}</button>
            </>
          )}
          {error && <p className="mt-5 rounded-[10px] bg-danger-soft px-4 py-3 text-danger">{error}</p>}
        </>
      )}
    </main>
  );
}

"use client";
// Mama's chat. Made for an older reader: large text, high contrast, options she can tap
// instead of typing a number, and her last light token always in reach.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MhasibuAvatar from "./MhasibuAvatar";
import { type ChatLine, type TokenRecord, loadHistory, loadTokens, saveAccessCode, sendMessage } from "@/lib/mhasibu";

const LAGOS = "Africa/Lagos";
const LINK = /(https:\/\/stellar\.expert\/\S+)/;
const IS_LINK = /^https:\/\/stellar\.expert\//;
const OPTION = /^(\d)\)\s+(.+)$/; // "1) ₦500" or "0) Cancel"
const QUICK = ["Light don almost finish", "Buy airtime", "Buy data", "How much is left?", "What did I buy?"];

const time = (at?: string) => (at ? new Date(at).toLocaleTimeString("en-NG", { timeZone: LAGOS, hour: "numeric", minute: "2-digit" }) : "");

// Her latest electricity token, pinned under the header so it never scrolls away.
function LastToken({ record }: { record: TokenRecord }) {
  const [copied, setCopied] = useState(false);
  const when = new Date(record.at).toLocaleString("en-NG", { timeZone: LAGOS, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <div className="border-b border-line bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">Last light token · ₦{record.ngn.toLocaleString("en-NG")} · {when}</div>
          <div className="mt-0.5 whitespace-nowrap font-mono text-[17px] font-semibold tracking-wide">{record.token}</div>
        </div>
        <button
          onClick={() => navigator.clipboard?.writeText(record.token.replace(/\s/g, "")).then(() => setCopied(true)).catch(() => {})}
          className="h-9 shrink-0 rounded-[10px] border border-foreground px-4 text-sm font-medium transition-colors duration-150 hover:bg-surface"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// Shown when the link had no access code: type it once, it's remembered on this device.
function CodeBox() {
  const [code, setCode] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) saveAccessCode(code); }} className="flex gap-2">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" aria-label="Access code" className="flex-1 rounded-[10px] border border-line bg-white px-4 py-3 outline-none focus:border-foreground" />
      <button className="rounded-[10px] bg-foreground px-5 font-medium text-background">Continue</button>
    </form>
  );
}

function Text({ text }: { text: string }) {
  return (
    <>
      {text.split(LINK).map((p, i) =>
        IS_LINK.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer" className="underline underline-offset-4">See the receipt</a> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

// One message. Mhasibu's numbered options become buttons she can tap.
function Bubble({ line, onPick, live }: { line: ChatLine; onPick: (n: string) => void; live: boolean }) {
  if (line.from === "mama") {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-foreground px-4 py-3 text-[17px] leading-relaxed text-background">{line.text}</div>
        {line.at && <span className="mt-1 pr-1 text-xs text-muted">{time(line.at)}</span>}
      </div>
    );
  }
  const rows = line.text.split("\n");
  const options = rows.map((r) => r.match(OPTION)).filter(Boolean) as RegExpMatchArray[];
  const prose = options.length >= 2 ? rows.filter((r) => !OPTION.test(r) && !/^Reply with/i.test(r)).join("\n") : line.text;
  return (
    <div className="flex items-end gap-2">
      <MhasibuAvatar className="mb-5 h-7 w-7 shrink-0" />
      <div className="min-w-0 max-w-[82%]">
        <div className="whitespace-pre-wrap rounded-[20px] rounded-bl-md border border-line bg-white px-4 py-3 text-[17px] leading-relaxed"><Text text={prose} /></div>
        {options.length >= 2 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {options.map((o) => (
              <button
                key={o[1]}
                disabled={!live}
                onClick={() => onPick(o[1])}
                className={`flex h-11 items-center gap-3 rounded-xl border px-4 text-left text-base transition-colors duration-150 disabled:opacity-50 ${o[1] === "0" ? "border-line text-muted" : "border-line bg-white font-medium hover:border-foreground"}`}
              >
                <span className="w-4 font-mono text-sm text-muted">{o[1]}</span>
                {o[2]}
              </button>
            ))}
          </div>
        )}
        {line.at && <span className="mt-1 block pl-1 text-xs text-muted">{time(line.at)}</span>}
      </div>
    </div>
  );
}

export default function Chat({ purse = "demo" }: { purse?: string }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [name, setName] = useState("Mama");
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<TokenRecord | null>(null);
  const refreshToken = () => loadTokens(purse).then((t) => setLastToken(t[0] ?? null)).catch(() => {});
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadHistory(purse)
      .then((h) => {
        setName(h.mama.name);
        setLines(h.history.slice(-30));
      })
      .catch((err) => setError(String(err?.message).includes("access code") ? "This link needs its access code. Please use the full link you were given." : "Mhasibu is not reachable right now. Please try again soon."));
    refreshToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purse]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, waiting]);

  async function submit(message: string) {
    const t = message.trim();
    if (!t || waiting) return;
    setText("");
    setError(null);
    setLines((l) => [...l, { from: "mama", text: t, at: new Date().toISOString() }]);
    setWaiting(true);
    try {
      const reply = await sendMessage(t, purse);
      setLines((l) => [...l, { from: "mhasibu", text: reply, at: new Date().toISOString() }]);
      refreshToken();
    } catch {
      setError("Mhasibu could not answer. Please try again.");
    } finally {
      setWaiting(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-surface sm:rounded-[24px] sm:border sm:border-line">
      <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
        <div className="relative">
          <MhasibuAvatar className="h-10 w-10" />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-live" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-tight">Mhasibu</div>
          <div className="truncate text-sm text-muted">For Mama {name}</div>
        </div>
        <Link href="/chat/purchases" className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-white px-4 text-sm font-medium transition-colors duration-150 hover:border-foreground">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4" /></svg>
          Purchases
        </Link>
      </header>

      {lastToken && <LastToken record={lastToken} />}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
        {lines.length === 0 && !error && (
          <div className="mx-auto max-w-xs pt-8 text-center">
            <MhasibuAvatar className="mx-auto h-14 w-14" />
            <p className="mt-4 text-lg font-medium">Ask for light, airtime or data</p>
            <p className="mt-1 text-base text-secondary">Write in English or Pidgin, or tap a button below</p>
          </div>
        )}
        {lines.map((l, i) => (
          <Bubble key={i} line={l} onPick={submit} live={!waiting && i === lines.length - 1} />
        ))}
        {waiting && (
          <div className="flex items-end gap-2" aria-label="Mhasibu is typing">
            <MhasibuAvatar className="h-7 w-7 shrink-0" />
            <div className="flex gap-1 rounded-[20px] rounded-bl-md border border-line bg-white px-4 py-4">
              {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />)}
            </div>
          </div>
        )}
        {error && <div className="rounded-2xl bg-danger-soft px-4 py-3 text-danger">{error}</div>}
        {error?.includes("access code") && <CodeBox />}
        <div ref={end} />
      </div>

      <div className="border-t border-line bg-white">
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-3 [scrollbar-width:none]">
          {QUICK.map((q) => (
            <button key={q} onClick={() => submit(q)} disabled={waiting} className="h-9 shrink-0 rounded-[10px] border border-line px-4 text-sm transition-colors duration-150 hover:border-foreground disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
        <form className="flex items-center gap-2 px-4 pb-4 pt-2" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message"
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-5 text-[17px] outline-none transition-colors duration-150 focus:border-foreground focus:bg-white"
            aria-label="Message to Mhasibu"
          />
          <button aria-label="Send" disabled={waiting || !text.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-foreground text-background transition-opacity disabled:opacity-30">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>
      </div>
    </section>
  );
}

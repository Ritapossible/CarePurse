"use client";
// Mama's chat. Deliberately plain: big text, numbered options, the token easy to read.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MhasibuAvatar from "./MhasibuAvatar";
import { type ChatLine, type TokenRecord, loadHistory, loadTokens, saveAccessCode, sendMessage } from "@/lib/mhasibu";

// Her latest electricity token, pinned above the chat so it never scrolls away.
function LastToken({ record }: { record: TokenRecord }) {
  const [copied, setCopied] = useState(false);
  const when = new Date(record.at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mx-4 mt-3 rounded-2xl border border-accent bg-accent-soft px-4 py-3">
      <div className="flex items-center justify-between text-sm text-accent">
        <span className="font-semibold">Last light token</span>
        <span>₦{record.ngn.toLocaleString("en-NG")} · {when}</span>
      </div>
      <div className="mt-1 whitespace-nowrap font-mono text-[19px] font-semibold tracking-wide text-foreground">{record.token}</div>
      <div className="mt-1 flex items-center justify-between text-sm text-muted">
        <span>{record.units ? `${record.units} · ` : ""}meter {record.meter}</span>
        <button
          onClick={() => navigator.clipboard?.writeText(record.token.replace(/\s/g, "")).then(() => setCopied(true)).catch(() => {})}
          className="rounded-lg border border-foreground px-3 py-1 text-foreground transition-colors duration-150 hover:bg-surface"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

const LINK = /(https:\/\/stellar\.expert\/\S+)/;
const IS_LINK = /^https:\/\/stellar\.expert\//;

// Shown when the link had no access code: type it once, it's remembered on this device.
function CodeBox() {
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) saveAccessCode(code);
      }}
      className="flex gap-2"
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Access code"
        aria-label="Access code"
        className="flex-1 rounded-[10px] border border-line bg-white px-4 py-3 outline-none focus:border-foreground"
      />
      <button className="rounded-[10px] bg-foreground px-5 font-medium text-background">Continue</button>
    </form>
  );
}

function Bubble({ line }: { line: ChatLine }) {
  const mine = line.from === "mama";
  const parts = line.text.split(LINK);
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[17px] leading-relaxed ${
          mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md border border-line bg-white"
        }`}
      >
        {parts.map((p, i) =>
          IS_LINK.test(p) ? (
            <a key={i} href={p} target="_blank" rel="noreferrer" className="underline">
              See the payment
            </a>
          ) : (
            <span key={i}>{p}</span>
          ),
        )}
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
        setLines(h.history.slice(-20));
      })
      .catch((err) => setError(String(err?.message).includes("access code") ? "This link needs its access code. Please use the full link you were given." : "Mhasibu is not reachable right now."));
    refreshToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purse]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, waiting]);

  async function submit(message: string) {
    const t = message.trim();
    if (!t || waiting) return;
    setText("");
    setError(null);
    setLines((l) => [...l, { from: "mama", text: t }]);
    setWaiting(true);
    try {
      const reply = await sendMessage(t, purse);
      setLines((l) => [...l, { from: "mhasibu", text: reply }]);
      refreshToken();
    } catch {
      setError("Mhasibu could not answer. Try again.");
    } finally {
      setWaiting(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-[20px] border border-line bg-surface">
      <header className="flex items-center gap-3 border-b border-line bg-white px-5 py-4 rounded-t-[20px]">
        <MhasibuAvatar className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Mhasibu</div>
          <div className="truncate text-sm text-muted">Helping {name} with light, airtime and data</div>
        </div>
        <Link href="/chat/purchases" className="shrink-0 rounded-[10px] border border-line px-3 py-2 text-sm font-medium transition-colors duration-150 hover:border-foreground">
          My purchases
        </Link>
      </header>

      {lastToken && <LastToken record={lastToken} />}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {lines.length === 0 && !error && (
          <p className="text-center text-muted">Say hello, or tell Mhasibu what you need. For example: &ldquo;Abeg, light don almost finish&rdquo;.</p>
        )}
        {lines.map((l, i) => (
          <Bubble key={i} line={l} />
        ))}
        {waiting && <div className="text-muted">Mhasibu is working…</div>}
        {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-danger">{error}</div>}
        {error?.includes("access code") && <CodeBox />}
        <div ref={end} />
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-2">
        {["Light don almost finish", "My data don finish", "Recharge my line", "Send my token again", "What did I buy?"].map((q) => (
          <button key={q} onClick={() => submit(q)} disabled={waiting} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm transition-colors duration-150 hover:border-foreground disabled:opacity-50">
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-line bg-white px-4 py-3 rounded-b-[20px]"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type here, or reply with a number"
          className="min-w-0 flex-1 rounded-[10px] border border-line px-4 py-3 text-[17px] outline-none focus:border-foreground"
          aria-label="Message to Mhasibu"
        />
        <button disabled={waiting || !text.trim()} className="rounded-[10px] bg-accent px-5 font-semibold text-white disabled:opacity-40">
          Send
        </button>
      </form>
    </section>
  );
}

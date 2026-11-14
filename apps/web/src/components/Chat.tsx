"use client";
// Mama's chat. Deliberately plain: big text, numbered options, the token easy to read.
import { useEffect, useRef, useState } from "react";
import { type ChatLine, loadHistory, sendMessage } from "@/lib/mhasibu";

const LINK = /(https:\/\/stellar\.expert\/\S+)/;
const IS_LINK = /^https:\/\/stellar\.expert\//;

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
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadHistory(purse)
      .then((h) => {
        setName(h.mama.name);
        setLines(h.history.slice(-20));
      })
      .catch(() => setError("Mhasibu is not reachable right now."));
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
    } catch {
      setError("Mhasibu could not answer. Try again.");
    } finally {
      setWaiting(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-line bg-[#fafafa]">
      <header className="flex items-center gap-3 border-b border-line bg-white px-5 py-4 rounded-t-3xl">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft font-semibold text-accent">M</div>
        <div>
          <div className="font-semibold">Mhasibu</div>
          <div className="text-sm text-muted">Helping {name} with light, airtime and data</div>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {lines.length === 0 && !error && (
          <p className="text-center text-muted">Say hello, or tell Mhasibu what you need. For example: &ldquo;Abeg, light don almost finish&rdquo;.</p>
        )}
        {lines.map((l, i) => (
          <Bubble key={i} line={l} />
        ))}
        {waiting && <div className="text-muted">Mhasibu is working…</div>}
        {error && <div className="rounded-xl bg-danger-soft px-4 py-3 text-danger">{error}</div>}
        <div ref={end} />
      </div>

      <div className="flex gap-2 px-4 pb-2">
        {["Light don almost finish", "My data don finish", "Recharge my line"].map((q) => (
          <button key={q} onClick={() => submit(q)} disabled={waiting} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50">
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-line bg-white px-4 py-3 rounded-b-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type here, or reply with a number"
          className="flex-1 rounded-full border border-line px-4 py-3 text-[17px] outline-none focus:border-accent"
          aria-label="Message to Mhasibu"
        />
        <button disabled={waiting || !text.trim()} className="rounded-full bg-accent px-5 font-semibold text-white disabled:opacity-40">
          Send
        </button>
      </form>
    </section>
  );
}

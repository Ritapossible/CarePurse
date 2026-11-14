"use client";
// The Agent & x402 Log: every step Mhasibu takes, live, for the judges.
// Mama never sees this; it sits beside her chat on the demo page.
import { useEffect, useRef, useState } from "react";
import { type LogEvent, type Status, MHASIBU_URL, loadStatus, short, tryOverspend, usdc } from "@/lib/mhasibu";

type Tone = "plain" | "x402" | "chain" | "ok" | "no";
type Row = { tone: Tone; label: string; detail: string; link?: string };

function describe(e: LogEvent): Row | null {
  switch (e.type) {
    case "mama":
      return { tone: "plain", label: "Mama", detail: `“${e.text}”` };
    case "understood":
      return { tone: "plain", label: "Understood", detail: [e.intent, e.utility, e.choice != null ? `option ${e.choice}` : null].filter(Boolean).join(" · ") };
    case "rules-ok":
      return { tone: "ok", label: "Rules in code", detail: `allowlist, quoted price, saved destination, limits and balance all pass for ₦${e.ngn?.toLocaleString("en-NG")}` };
    case "order":
      return { tone: "plain", label: "Order", detail: `${e.id} → GET ${e.payPath?.split("?")[0]}` };
    case "quote":
      return { tone: "x402", label: "402 Payment Required", detail: `scheme exact · ${e.network} · ${usdc(e.amount)} USDC to ${short(e.payTo)} (PAYMENT-REQUIRED)` };
    case "contract-check":
      return { tone: "chain", label: "Soroban purse contract", detail: `buy(${e.utility}, ${usdc(e.amount)} USDC): checking Adaeze's caps and saved destination on-chain` };
    case "contract-ok":
      return { tone: "ok", label: "Contract approved", detail: e.text ?? "caps passed; released exactly this amount to the agent wallet", link: e.link };
    case "contract-refused":
      return { tone: "no", label: "Refused on-chain", detail: `the purse contract said no: ${e.rule} limit (Error #${e.code}). No USDC moved.` };
    case "signing":
      return { tone: "x402", label: "Sign and retry", detail: `signed a Soroban auth entry for exactly ${usdc(e.amount)} USDC, retried with PAYMENT-SIGNATURE` };
    case "paid":
      return { tone: "ok", label: "Settled on Stellar Testnet", detail: `the facilitator settled the payment (PAYMENT-RESPONSE) · ₦${e.ngn?.toLocaleString("en-NG")} ${e.utility}`, link: e.link };
    case "refused":
      return { tone: "no", label: "Refused by the rules", detail: `${e.rule}: ${e.reason}` };
    case "notify-guardian":
      return { tone: "plain", label: "Adaeze notified", detail: `${e.kind}` };
    case "attack":
      return { tone: "no", label: "Overspend attempt", detail: e.text ?? "" };
    case "payment-failed":
    case "error":
      return { tone: "no", label: "Error", detail: e.message ?? "" };
    default:
      return null;
  }
}

const TONE: Record<Tone, string> = {
  plain: "border-line",
  x402: "border-[#c7d2fe] bg-[#f5f7ff]",
  chain: "border-[#fde68a] bg-[#fffbeb]",
  ok: "border-[#bbf7d0] bg-[#f0fdf4]",
  no: "border-[#fecaca] bg-[#fef2f2]",
};

export default function AgentLog() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [live, setLive] = useState(false);
  const [trying, setTrying] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadStatus().then(setStatus).catch(() => {});
    const source = new EventSource(`${MHASIBU_URL}/v1/events`);
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.onmessage = (m) => setEvents((list) => [...list.slice(-150), JSON.parse(m.data)]);
    return () => source.close();
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const rows = events.map((e) => ({ e, row: describe(e) })).filter((r) => r.row);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-line bg-white">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <div className="font-semibold">Agent &amp; x402 Log</div>
          <div className="text-sm text-muted">
            {status ? (
              <>
                {status.understander} · {status.phase === 2 ? "limits enforced on-chain" : "limits in code"} ·{" "}
                {status.purseContractLink ? (
                  <a className="underline" href={status.purseContractLink} target="_blank" rel="noreferrer">
                    purse contract {short(status.purseContract ?? "")}
                  </a>
                ) : (
                  "no contract"
                )}
              </>
            ) : (
              "connecting…"
            )}
          </div>
        </div>
        <span className={`flex items-center gap-2 text-sm ${live ? "text-accent" : "text-muted"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "bg-accent" : "bg-muted"}`} /> {live ? "live" : "offline"}
        </span>
      </header>

      <ol className="flex-1 space-y-2 overflow-y-auto px-4 py-4 font-mono text-[13px] leading-snug">
        {rows.length === 0 && <li className="font-sans text-muted">Waiting for Mama&rsquo;s first message…</li>}
        {rows.map(({ e, row }, i) => (
          <li key={i} className={`rounded-xl border px-3 py-2 ${TONE[row!.tone]}`}>
            <div className="flex justify-between gap-3">
              <span className="font-semibold">{row!.label}</span>
              <span className="text-muted">{new Date(e.at).toLocaleTimeString("en-GB")}</span>
            </div>
            <div className="mt-0.5 break-words">{row!.detail}</div>
            {row!.link && (
              <a href={row!.link} target="_blank" rel="noreferrer" className="mt-1 inline-block underline">
                tx {short(e.tx)} on stellar.expert
              </a>
            )}
          </li>
        ))}
        <div ref={end} />
      </ol>

      {status?.demoMode && status.phase === 2 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-sm text-muted">Skip Mhasibu&rsquo;s own checks and ask the contract for more than Adaeze allows.</p>
          <button
            disabled={trying}
            onClick={async () => {
              setTrying(true);
              await tryOverspend(7).finally(() => setTrying(false));
            }}
            className="shrink-0 rounded-full border border-danger px-4 py-2 text-sm font-semibold text-danger disabled:opacity-50"
          >
            {trying ? "Asking the contract…" : "Try to take 7 USDC"}
          </button>
        </div>
      )}
    </section>
  );
}

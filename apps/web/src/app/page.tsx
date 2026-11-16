import Link from "next/link";
import PhoneChat from "@/components/PhoneChat";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

const STEPS = [
  { title: "Fund the purse", tag: "You", text: "Add USDC. It sits in a contract on Stellar, not with us." },
  { title: "Set the limits", tag: "On-chain", text: "Per top-up, day, week and month. Only you can change them." },
  { title: "Mama asks", tag: "Chat", text: "In English or Pidgin, typos included. No app to learn." },
  { title: "Mhasibu pays", tag: "x402", text: "Only what you allowed, only to her saved meter or phone." },
  { title: "The token arrives", tag: "Seconds", text: "In her chat and in your receipt. She can ask for it again." },
];

const RULES = [
  { n: "01", title: "Limits on-chain", text: "The purse contract refuses any top-up over your caps, even if the agent asks." },
  { n: "02", title: "Private AI", text: "Mama’s words go only to a model running in sealed hardware." },
  { n: "03", title: "Your fee, not hers", text: "3% on top, shown on your receipts. Mama sees face value." },
  { n: "04", title: "No lost tokens", text: "Every token is saved. She can ask for it again any time." },
];

const FAQ = [
  { q: "Who holds the money?", a: "A contract on Stellar. Only you can change its limits or withdraw. Mhasibu receives one approved top-up at a time." },
  { q: "Does Mama need a wallet or crypto?", a: "No. She chats. You fund the purse." },
  { q: "What if she types it wrong?", a: "Mhasibu reads plain English and Pidgin, typos included. If it isn’t sure, it shows a short numbered menu." },
  { q: "What if a payment fails?", a: "The money goes back to the purse and she’s told she wasn’t charged." },
  { q: "Can someone talk the AI into paying more?", a: "No. The AI only sorts her request. Amounts, limits and payees are checked in code and by the contract." },
  { q: "What does it cost?", a: "A 3% service fee on each top-up, paid from the purse." },
  { q: "Is this live?", a: "Payments are live on Stellar Testnet. Utilities are fulfilled in the VTpass sandbox." },
];

// A still of the live log, from a real run (GitHub Actions, run 20): Stellar Testnet transactions.
const LOG = [
  { label: "Understood", detail: "buy · electricity" },
  { label: "HTTP 402", detail: "0.3503402 USDC to the gateway" },
  { label: "Rules in code", detail: "limits, payee, price, meter: pass" },
  { label: "Purse contract", detail: "released 0.3503402 USDC", tx: "3a20fd…a495" },
  { label: "Paid over x402", detail: "settled on Stellar", tx: "771ff7…909c" },
  { label: "Order closed", detail: "committed on-chain", tx: "9282c5…9164" },
];

const RAILS = ["Stellar", "x402", "Soroban", "USDC", "NEAR AI", "VTpass"];

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-14 md:grid-cols-[1.15fr_1fr] md:pt-24">
          <div>
            <Link href="/demo" className="inline-flex items-center gap-2.5 rounded-full border border-line px-4 py-2 text-[15px] hover:border-foreground">
              <span className="h-2 w-2 rounded-full bg-live" />
              Live on Stellar Testnet
              <Arrow />
            </Link>
            <h1 className="mt-8 text-[52px] font-semibold leading-[0.98] tracking-[-0.04em] sm:text-7xl">
              Keep Mama’s
              <br />
              utilities on.
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-muted sm:text-xl">
              Fund a purse for your parent in Nigeria. She asks in chat. Mhasibu buys electricity, airtime and data within the
              limits you set, and pays over x402 on Stellar.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className="inline-flex items-center justify-center gap-2.5 rounded-full bg-foreground px-7 py-4 font-medium text-background hover:opacity-85">
                Open the demo <Arrow />
              </Link>
              <Link href="#how" className="inline-flex items-center justify-center rounded-full border border-line px-7 py-4 font-medium hover:border-foreground">
                How it works
              </Link>
            </div>
          </div>
          <PhoneChat />
        </section>

        {/* Rails */}
        <section className="border-y border-line">
          <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-10 gap-y-3 px-5 py-6 text-[13px] font-medium uppercase tracking-[0.25em] text-muted">
            {RAILS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
          <p className="text-[13px] font-medium uppercase tracking-[0.25em] text-muted">How it works</p>
          <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">From your purse to her meter and phone.</h2>
          <ol className="mt-12 divide-y divide-line rounded-3xl border border-line">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-5 px-6 py-7 sm:px-8">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-sm tabular-nums text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted">{s.tag}</span>
                  </div>
                  <p className="mt-1.5 text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Live log banner */}
        <section className="mx-auto max-w-6xl px-5">
          <div className="grid items-center gap-12 rounded-[32px] bg-foreground px-7 py-14 text-background sm:px-14 sm:py-20 lg:grid-cols-2">
            <div>
            <p className="text-[13px] font-medium uppercase tracking-[0.25em] text-background/60">Agent &amp; x402 log</p>
            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">Watch every payment happen.</h2>
            <p className="mt-5 max-w-lg text-lg text-background/70">
              The contract check, the 402, the signed payment and the Stellar transaction appear as Mama chats.
            </p>
            <Link href="/demo" className="mt-9 inline-flex items-center gap-3 rounded-full bg-background py-2 pl-6 pr-2 font-medium text-foreground hover:opacity-90">
              Open the demo
              <span className="grid h-10 w-10 place-items-center rounded-full bg-foreground text-background">
                <Arrow />
              </span>
            </Link>
            </div>
            <ol className="space-y-2 font-mono text-[13px]">
              {LOG.map((l) => (
                <li key={l.label} className="flex items-center justify-between gap-4 rounded-xl border border-background/15 px-4 py-3">
                  <span>
                    <span className="text-background">{l.label}</span>
                    <span className="text-background/55"> · {l.detail}</span>
                  </span>
                  {l.tx && <span className="shrink-0 text-background/55">{l.tx}</span>}
                </li>
              ))}
              <li className="flex items-center gap-2 px-1 pt-2 text-background/55">
                <span className="h-2 w-2 rounded-full bg-live" /> 19 s from Mama’s “1” to her token
              </li>
            </ol>
          </div>
        </section>

        {/* Rules */}
        <section className="mx-auto max-w-6xl px-5 py-24">
          <p className="text-[13px] font-medium uppercase tracking-[0.25em] text-muted">The rules</p>
          <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">Limits live in code, not in the prompt.</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {RULES.map((r) => (
              <div key={r.n} className="rounded-3xl border border-line p-7">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted">{r.title}</span>
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-line text-xs tabular-nums text-muted">{r.n}</span>
                </div>
                <p className="mt-6 text-lg leading-snug">{r.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-line">
          <div className="mx-auto max-w-3xl scroll-mt-20 px-5 py-24">
            <p className="text-[13px] font-medium uppercase tracking-[0.25em] text-muted">FAQ</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Questions, answered.</h2>
            <div className="mt-10 border-t border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-line">
                  <summary className="flex cursor-pointer items-center justify-between gap-6 py-6 text-lg">
                    {f.q}
                    <span className="faq-plus grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-xl leading-none text-muted transition-transform">+</span>
                  </summary>
                  <p className="-mt-2 pb-6 pr-14 text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

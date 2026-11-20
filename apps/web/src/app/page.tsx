import Link from "next/link";
import PhoneChat from "@/components/PhoneChat";
import Rails from "@/components/Rails";
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
  { title: "Limits on-chain", text: "The purse contract refuses any top-up over your caps, even if the agent asks." },
  { title: "Private AI", text: "Mama’s words go only to a model running in sealed hardware." },
  { title: "Your fee, not hers", text: "3% on top, shown on your receipts. Mama sees face value." },
  { title: "No lost tokens", text: "Every token is saved. She can ask for it again any time." },
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

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const label = "text-sm text-muted";
const h2 = "mt-3 max-w-2xl text-4xl font-medium leading-[1.1] tracking-[-0.02em] sm:text-5xl";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero: text and the phone, centred against each other */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-12 md:grid-cols-[1.1fr_1fr] md:gap-16 md:pt-20">
          <div>
            <p className="text-sm text-secondary">Live on Stellar Testnet</p>
            <h1 className="mt-6 text-[44px] font-medium leading-[1.04] tracking-[-0.03em] sm:text-6xl lg:text-[72px]">
              Keep Mama’s
              <br />
              utilities on
            </h1>
            <p className="mt-6 max-w-[36rem] text-lg leading-[1.6] text-secondary sm:text-xl">
              Fund a purse for your parent in Nigeria. She asks in chat. Mhasibu buys electricity, airtime and data within the
              limits you set, and pays over x402 on Stellar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/start" className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-foreground px-5 font-medium text-background transition-colors duration-150 hover:bg-[#262626]">
                Launch App <Arrow />
              </Link>
              <Link href="#how" className="inline-flex h-12 items-center justify-center rounded-[10px] border border-line px-5 font-medium transition-colors duration-150 hover:bg-surface">
                How it works
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted">I’m Mama: ask your child to set up CarePurse and send you the link.</p>
          </div>
          <PhoneChat />
        </section>

        {/* What it runs on */}
        <section className="border-y border-line" aria-label="Built on">
          <Rails />
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 md:py-32">
          <p className={label}>How it works</p>
          <h2 className={h2}>From your purse to her meter and phone</h2>
          <ol className="mt-12 divide-y divide-line rounded-2xl border border-line">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[32px_1fr] gap-4 p-6 sm:grid-cols-[40px_1fr]">
                <span className="pt-0.5 font-mono text-sm tabular-nums text-muted">{i + 1}</span>
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-xl font-medium">{s.title}</h3>
                    <span className="text-sm text-muted">{s.tag}</span>
                  </div>
                  <p className="mt-1 text-secondary">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* The live log */}
        <section id="log" className="mx-auto max-w-6xl scroll-mt-20 px-6">
          <div className="grid items-center gap-12 rounded-[20px] bg-foreground px-6 py-12 text-background sm:px-12 sm:py-16 lg:grid-cols-2">
            <div>
              <p className="text-sm text-background/60">Agent &amp; x402 log</p>
              <h2 className="mt-3 max-w-xl text-4xl font-medium leading-[1.1] tracking-[-0.02em] sm:text-5xl">Watch every payment happen</h2>
              <p className="mt-5 max-w-lg text-lg leading-[1.6] text-background/70">
                The contract check, the 402, the signed payment and the Stellar transaction, for every top-up Mama asks for.
              </p>
              <Link href="/start" className="mt-8 inline-flex h-12 items-center gap-2 rounded-[10px] bg-background px-5 font-medium text-foreground transition-colors duration-150 hover:bg-[#e5e5e5]">
                Launch App <Arrow />
              </Link>
            </div>
            <ol className="space-y-2 font-mono text-[13px]">
              {LOG.map((l) => (
                <li key={l.label} className="flex items-center justify-between gap-4 rounded-[10px] border border-background/15 px-4 py-3">
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

        {/* The rules: a list, not four equal cards */}
        <section id="rules" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24 md:py-32">
          <p className={label}>The rules</p>
          <h2 className={h2}>Limits live in code, not in the prompt</h2>
          <dl className="mt-12 border-t border-line">
            {RULES.map((r) => (
              <div key={r.title} className="grid gap-2 border-b border-line py-6 md:grid-cols-[280px_1fr] md:gap-8">
                <dt className="text-lg font-medium">{r.title}</dt>
                <dd className="text-lg text-secondary">{r.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-line">
          <div className="mx-auto max-w-3xl scroll-mt-20 px-6 py-24 md:py-32">
            <p className={label}>FAQ</p>
            <h2 className="mt-3 text-4xl font-medium tracking-[-0.02em] sm:text-5xl">Questions, answered</h2>
            <div className="mt-10 border-t border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="border-b border-line">
                  <summary className="flex cursor-pointer items-center justify-between gap-6 py-6 text-lg transition-colors duration-150 hover:text-secondary">
                    {f.q}
                    <span aria-hidden="true" className="faq-plus shrink-0 text-2xl font-light leading-none text-muted transition-transform duration-200">+</span>
                  </summary>
                  <p className="-mt-2 pb-6 pr-12 text-secondary">{f.a}</p>
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

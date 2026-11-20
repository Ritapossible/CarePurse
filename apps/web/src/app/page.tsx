import Link from "next/link";
import PhoneChat from "@/components/PhoneChat";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

const STEPS = [
  { title: "Fund the purse", tag: "You", text: "Add money once. It stays in Mama’s purse, not with us." },
  { title: "Set the limits", tag: "You", text: "Per top-up, day, week and month. Only you can change them." },
  { title: "Mama asks", tag: "Chat", text: "In English or Pidgin, typos included. No app to learn." },
  { title: "Mhasibu pays", tag: "Instant", text: "Only what you allowed, only to her saved meter or phone." },
  { title: "The token arrives", tag: "Seconds", text: "In her chat and in your receipt. She can ask for it again." },
];

const RULES = [
  { title: "Hard limits", text: "Mama’s purse itself refuses any top-up over your caps, even if the AI asks." },
  { title: "Private AI", text: "Mama’s words go only to a model running in sealed hardware." },
  { title: "Your fee, not hers", text: "3% on top, shown on your receipts. Mama sees face value." },
  { title: "No lost tokens", text: "Every token is saved. She can ask for it again any time." },
];

const FAQ = [
  { q: "Who holds the money?", a: "Mama’s purse, which only you control. Only you can change its limits or withdraw. Mhasibu receives one approved top-up at a time." },
  { q: "Does Mama need a wallet or crypto?", a: "No. She chats. You fund the purse." },
  { q: "What if she types it wrong?", a: "Mhasibu reads plain English and Pidgin, typos included. If it isn’t sure, it shows a short numbered menu." },
  { q: "What if a payment fails?", a: "The money goes back to the purse and she’s told she wasn’t charged." },
  { q: "Can someone talk the AI into paying more?", a: "No. The AI only sorts her request. Amounts, limits and payees are checked in code and by the contract." },
  { q: "What does it cost?", a: "A 3% service fee on each top-up, paid from the purse." },
  { q: "Is this live?", a: "It’s a working pilot: payments run on a test network and utilities come from a sandbox, so no real money moves yet." },
];

// The receipt card in the banner: what Adaeze sees after each top-up (sample values).
const RECEIPT = [
  { k: "For", v: "Mama Ngozi" },
  { k: "Meter", v: "•••• 1111" },
  { k: "Units", v: "8.9 kWh" },
  { k: "Paid from", v: "Mama’s purse" },
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
            <p className="text-sm text-secondary">For families in Nigeria</p>
            <h1 className="mt-6 text-[44px] font-medium leading-[1.04] tracking-[-0.03em] sm:text-6xl lg:text-[72px]">
              Keep Mama’s
              <br />
              utilities on
            </h1>
            <p className="mt-6 max-w-[36rem] text-lg leading-[1.6] text-secondary sm:text-xl">
              Fund a purse for your parent. She asks in chat, and Mhasibu buys electricity, airtime and data within the limits
              you set.
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

        {/* Receipts: what the daughter sees after every top-up */}
        <section id="log" className="mx-auto max-w-6xl scroll-mt-20 px-6">
          <div className="grid items-center gap-12 rounded-[20px] bg-foreground px-6 py-12 text-background sm:px-12 sm:py-16 lg:grid-cols-2">
            <div>
              <p className="text-sm text-background/60">Receipts</p>
              <h2 className="mt-3 max-w-xl text-4xl font-medium leading-[1.1] tracking-[-0.02em] sm:text-5xl">Every top-up, accounted for</h2>
              <p className="mt-5 max-w-lg text-lg leading-[1.6] text-background/70">You get a receipt the moment Mama’s token arrives. Nothing is bought without your rules.</p>
              <Link href="/start" className="mt-8 inline-flex h-12 items-center gap-2 rounded-[10px] bg-background px-5 font-medium text-foreground transition-colors duration-150 hover:bg-[#e5e5e5]">
                Launch App <Arrow />
              </Link>
            </div>
            <div className="mx-auto w-full max-w-sm rounded-2xl bg-background p-6 text-foreground shadow-[0_24px_48px_-16px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Electricity</span>
                <span className="inline-flex items-center gap-1.5 text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-live" />Delivered</span>
              </div>
              <div className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums">₦5,000</div>
              <div className="mt-1 text-sm text-muted">Today, 21:00</div>
              <div className="mt-5 rounded-xl bg-surface px-4 py-3">
                <div className="text-xs text-muted">Token</div>
                <div className="mt-1 whitespace-nowrap font-mono text-[15px] font-semibold tracking-wide">1111 2222 3333 4444 5555</div>
              </div>
              <dl className="mt-5 space-y-2.5 text-sm">
                {RECEIPT.map((r) => (
                  <div key={r.k} className="flex justify-between gap-4">
                    <dt className="text-muted">{r.k}</dt>
                    <dd className="font-medium">{r.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
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

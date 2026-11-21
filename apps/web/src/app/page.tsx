// The landing page. Structure after HashPayLink: one idea per screen, text on one side and a
// product card on the other, floating white cards on a soft warm wash, a partner strip and a
// technology grid. Photos are framed as cards.
import Image from "next/image";
import Link from "next/link";
import PhoneChat from "@/components/PhoneChat";
import { RAILS, RailLogo } from "@/components/Rails";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import TokenCard, { Status } from "@/components/TokenCard";

const STEPS = [
  { title: "Fund the purse", tag: "You", text: "Add money once. It stays in Mama’s purse, not with us." },
  { title: "Set her limits", tag: "You", text: "Per top-up, day, week and month. Only you can change them." },
  { title: "Invite Mama", tag: "One link", text: "She signs in with her phone number. No app to install." },
  { title: "Mama asks", tag: "Chat", text: "In English or Pidgin, typos included." },
  { title: "Mhasibu AI pays", tag: "Instant", text: "Only what you allowed, only to her saved meter or phone." },
  { title: "The token arrives", tag: "Seconds", text: "In her chat and on your receipts. She can ask for it again." },
];

const CHAT_POINTS = [
  { tag: "Language", title: "English or Pidgin", text: "Mhasibu AI answers in the one she writes in." },
  { tag: "Options", title: "Tap, don’t type", text: "Amounts come as buttons she can tap." },
  { tag: "Tokens", title: "Never lost", text: "Her last light token stays pinned on top." },
  { tag: "History", title: "Ask any day", text: "“What did I buy on Monday?” just works." },
];

const RULES = [
  { title: "Hard limits", text: "Mama’s purse itself refuses any top-up over your caps, even if the AI asks." },
  { title: "Private AI", text: "Mama’s words go only to a model running in sealed hardware." },
  { title: "Your fee, not hers", text: "3% on top, on your receipts. Mama sees face value." },
  { title: "Saved payees only", text: "Money only goes to the meter and phone you saved." },
];

const FAQ = [
  { q: "Who holds the money?", a: "Mama’s purse, which only you control. Only you can change its limits or withdraw. Mhasibu AI receives one approved top-up at a time." },
  { q: "Does Mama need a wallet or crypto?", a: "No. She chats. You fund the purse." },
  { q: "What if she types it wrong?", a: "Mhasibu AI reads plain English and Pidgin, typos included. If it isn’t sure, it shows a short numbered menu." },
  { q: "What if a payment fails?", a: "The money goes back to the purse and she’s told she wasn’t charged." },
  { q: "Can someone talk the AI into paying more?", a: "No. The AI only sorts her request. Amounts, limits and payees are checked in code and by the purse itself." },
  { q: "What does it cost?", a: "A 3% service fee on each top-up, paid from the purse." },
  { q: "Can she see what she bought?", a: "Yes. Her purchases page lists every top-up by day, and she can ask Mhasibu AI about any date." },
  { q: "Is this live?", a: "It’s a working pilot: payments run on a test network and utilities come from a sandbox, so no real money moves yet." },
];

const card = "rounded-[28px] border border-[#161412]/[0.06] bg-white shadow-[0_24px_60px_-28px_rgba(70,45,20,0.25)]";
const eyebrow = "text-xs font-medium uppercase tracking-[0.18em] text-[#8a5a2b]";
const h2 = "mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl";
const lead = "mt-5 max-w-md text-[17px] leading-[1.6] text-secondary";
const section = "mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:min-h-[80svh] lg:gap-16 lg:py-20";

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Cta({ href = "/start", children, light = false }: { href?: string; children: React.ReactNode; light?: boolean }) {
  return (
    <Link
      href={href}
      className={`mt-8 inline-flex h-12 items-center gap-3 rounded-full pl-6 pr-2 font-medium transition-colors duration-150 ${light ? "bg-white text-foreground hover:bg-[#f3efe9]" : "bg-foreground text-background hover:bg-[#2b2825]"}`}
    >
      {children}
      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${light ? "bg-foreground text-background" : "bg-white/15"}`}><Arrow /></span>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="relative">
      {/* The warm wash behind the whole page: soft light, not a colour block */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[#fbf9f6]">
        <div className="absolute -left-40 -top-40 h-[640px] w-[640px] rounded-full bg-[#f4e3cf] opacity-60 blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[560px] w-[560px] rounded-full bg-[#efe6dc] opacity-70 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-[480px] w-[480px] rounded-full bg-[#f6ebe0] opacity-60 blur-[120px]" />
      </div>

      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-12 pt-12 lg:min-h-[calc(100svh-64px-120px)] lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-8">
          <div>
            <p className={eyebrow}>Live on Stellar testnet</p>
            <h1 className="mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[72px]">Keep Mama’s utilities on</h1>
            <p className="mt-6 max-w-lg text-lg leading-[1.6] text-secondary">
              Fund a purse for your parent in Nigeria. She asks in chat, and Mhasibu AI buys electricity, airtime and data within the
              limits you set.
            </p>
            <div className="flex flex-wrap items-center gap-x-6">
              <Cta>Launch App</Cta>
              <Link href="#how" className="mt-8 inline-flex h-12 items-center rounded-full border border-[#161412]/10 bg-white/70 px-6 font-medium backdrop-blur transition-colors duration-150 hover:bg-white">How it works</Link>
            </div>
            <p className="mt-6 text-sm text-muted">I’m Mama: ask your child to set up CarePurse and send you the link</p>
          </div>
          <div className="relative">
            <div className={`relative aspect-[5/6] overflow-hidden ${card} sm:aspect-[4/3] lg:aspect-[5/6]`}>
              <Image src="/photos/scene-mama.jpg" alt="An older Nigerian woman in ankara and gele smiling at her phone at home, a prepaid meter glowing on the wall behind her" fill priority sizes="(min-width: 1024px) 520px, 100vw" className="object-cover object-[52%_center]" />
            </div>
            <TokenCard
              title="Electricity · ₦5,000"
              token="1111 2222 3333 4444 5555"
              right={<Status />}
              className="absolute inset-x-4 -bottom-6 bg-white shadow-[0_16px_40px_-12px_rgba(40,25,10,0.35)] sm:inset-x-8 lg:-left-10 lg:right-16"
            />
          </div>
        </section>

        {/* Partner strip */}
        <section aria-label="Built with" className="mx-auto max-w-6xl px-6 pb-8 pt-10">
          <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 rounded-[20px] border border-[#161412]/[0.06] bg-white/60 px-6 py-6 opacity-80 grayscale backdrop-blur">
            {RAILS.filter((r) => r.name !== "Soroban").map((r) => (
              <li key={r.name}><RailLogo rail={r} /></li>
            ))}
          </ul>
        </section>

        {/* How it works: a numbered card, like a list of products */}
        <section id="how" className={`${section} scroll-mt-16 lg:grid-cols-[0.8fr_1.2fr]`}>
          <div>
            <p className={eyebrow}>How it works</p>
            <h2 className={h2}>From your purse to her meter and phone</h2>
            <p className={lead}>You set it up once in about three minutes. After that, Mama just chats.</p>
            <Cta>Set it up for her</Cta>
          </div>
          <ol className={`${card} divide-y divide-[#161412]/[0.06] px-2 py-2 sm:px-4`}>
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex items-center gap-4 px-3 py-4 sm:gap-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f6f2ec] font-mono text-xs text-secondary">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h3 className="text-[17px] font-semibold">{s.title}</h3>
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#8a5a2b]">{s.tag}</span>
                  </div>
                  <p className="mt-1 text-sm text-secondary">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Mama's chat */}
        <section className={`${section} lg:grid-cols-[1fr_1fr]`}>
          <div className="order-2 flex justify-center lg:order-1">
            <PhoneChat />
          </div>
          <div className="order-1 lg:order-2">
            <p className={eyebrow}>For Mama</p>
            <h2 className={h2}>She asks. It’s done.</h2>
            <p className={lead}>No app to learn and no card to carry. She chats with Mhasibu AI, and her light, airtime or data arrives in seconds.</p>
            <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
              {CHAT_POINTS.map((p) => (
                <div key={p.title} className={`${card} rounded-[20px] p-5 shadow-[0_12px_32px_-20px_rgba(70,45,20,0.25)]`}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#8a5a2b]">{p.tag}</div>
                  <div className="mt-2 font-semibold">{p.title}</div>
                  <p className="mt-1 text-sm text-secondary">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* For the family: a photo card with the words on it, like a poster */}
        <section className={`${section} lg:grid-cols-[1.4fr_0.6fr]`}>
          <div className="relative min-h-[560px] overflow-hidden rounded-[28px] shadow-[0_24px_60px_-28px_rgba(70,45,20,0.35)]">
            <Image src="/photos/hug.jpg" alt="A smiling mother in a headwrap hugged by her grown-up daughter" fill sizes="(min-width: 1024px) 720px, 100vw" className="object-cover object-[60%_25%]" />
            <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-8 text-white sm:p-10">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">For you</p>
              <h2 className="mt-3 max-w-md text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">Look after Mama from anywhere</h2>
              <p className="mt-4 max-w-md text-white/80">Fund her purse once and set her limits. She buys what she needs, and you see every receipt.</p>
              <Cta light>Set it up for her</Cta>
            </div>
          </div>
          <div className="hidden flex-col gap-4 lg:flex">
            {[
              { src: "/photos/embrace.jpg", alt: "A mother and her daughter hugging, smiling", pos: "50% 30%", tilt: "-rotate-2" },
              { src: "/photos/elder.jpg", alt: "An older woman in a headwrap smiling with a thumbs up", pos: "50% 30%", tilt: "rotate-2 translate-x-6" },
            ].map((p) => (
              <div key={p.src} className={`relative aspect-[4/3] overflow-hidden rounded-[20px] border-4 border-white shadow-[0_16px_40px_-16px_rgba(70,45,20,0.35)] ${p.tilt}`}>
                <Image src={p.src} alt={p.alt} fill sizes="280px" className="object-cover" style={{ objectPosition: p.pos }} />
              </div>
            ))}
          </div>
        </section>

        {/* Receipts: the daughter's dashboard */}
        <section id="log" className={`${section} scroll-mt-16 lg:grid-cols-[0.9fr_1.1fr]`}>
          <div>
            <p className={eyebrow}>Your dashboard</p>
            <h2 className={h2}>Every top-up, accounted for</h2>
            <p className={lead}>Her balance, what she bought and the fee, in one place. You get a receipt the moment her token arrives.</p>
            <Cta>Open your dashboard</Cta>
          </div>
          <div className={`${card} p-3 sm:p-6`}>
            <div className="rounded-[20px] bg-foreground p-5 text-background sm:p-6">
              <div className="flex items-center justify-between text-sm text-background/60">
                <span>Mama Ngozi’s purse</span>
                <span className="inline-flex items-center gap-1.5 text-xs"><span className="h-1.5 w-1.5 rounded-full bg-live" />Active</span>
              </div>
              <div className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">₦44,100</div>
              <div className="mt-5 flex justify-between text-sm"><span className="text-background/60">Spent this month</span><span className="tabular-nums">₦6,500 <span className="text-background/50">of ₦120,000</span></span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/15"><div className="h-full w-[6%] rounded-full bg-background" /></div>
            </div>
            <div className="mt-4 space-y-3">
              <TokenCard title="Electricity" token="1111 2222 3333 4444 5555" meta="Today, 21:00" className="border border-[#161412]/[0.06]" right={<div className="text-right"><div className="text-sm font-medium tabular-nums">−₦5,150</div><div className="text-xs text-muted">incl. ₦150 fee</div></div>} />
              <TokenCard title="Airtime" meta="Yesterday, 18:40" className="border border-[#161412]/[0.06]" right={<div className="text-right"><div className="text-sm font-medium tabular-nums">−₦515</div><div className="text-xs text-muted">incl. ₦15 fee</div></div>} />
            </div>
          </div>
        </section>

        {/* The rules */}
        <section id="rules" className={`${section} scroll-mt-16 lg:grid-cols-[0.8fr_1.2fr]`}>
          <div>
            <p className={eyebrow}>The rules</p>
            <h2 className={h2}>Limits live in code, not in the prompt</h2>
            <p className={lead}>The AI only understands what Mama asks. Every amount and payee is checked twice before money moves.</p>
          </div>
          <div className={`${card} grid gap-px overflow-hidden bg-[#161412]/[0.06] sm:grid-cols-2`}>
            {RULES.map((r, i) => (
              <div key={r.title} className="bg-white p-6">
                <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                <div className="mt-3 text-lg font-semibold">{r.title}</div>
                <p className="mt-1 text-sm text-secondary">{r.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The technology */}
        <section className={`${section} lg:grid-cols-[0.8fr_1.2fr]`}>
          <div>
            <p className={eyebrow}>Built with</p>
            <h2 className={h2}>The technology behind CarePurse</h2>
            <p className={lead}>Open networks and services, each doing one job well. Payments run on a test network for now.</p>
          </div>
          <div className={`${card} grid gap-px overflow-hidden bg-[#161412]/[0.06] sm:grid-cols-2`}>
            {RAILS.map((r) => (
              <div key={r.name} className="bg-white p-6 sm:[&:last-child:nth-child(odd)]:col-span-2">
                <RailLogo rail={r} />
                <p className="mt-2 text-sm text-secondary">{r.what}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={`${section} scroll-mt-16 lg:grid-cols-[0.7fr_1.3fr]`}>
          <div>
            <p className={eyebrow}>FAQ</p>
            <h2 className={h2}>A few things you might want to know</h2>
            <Cta>Launch App</Cta>
          </div>
          <div className={`${card} grid gap-x-8 px-6 py-2 sm:grid-cols-2`}>
            {FAQ.map((f) => (
              <details key={f.q} className="border-b border-[#161412]/[0.06] last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
                <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 text-[15px] font-medium transition-colors duration-150 hover:text-secondary">
                  {f.q}
                  <span aria-hidden="true" className="faq-plus shrink-0 text-xl font-light leading-none text-muted transition-transform duration-200">+</span>
                </summary>
                <p className="-mt-2 pb-5 text-sm text-secondary">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

import Link from "next/link";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">CarePurse</p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight">Keep Mama&rsquo;s light, airtime and data on, from anywhere.</h1>
      <p className="mt-4 text-lg text-muted">
        Fund it once. Mhasibu AI tops up her electricity, airtime and data within the limits you set, and pays for each top-up over x402 on Stellar.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/demo" className="rounded-full bg-accent px-6 py-3 font-semibold text-white">
          Watch the demo
        </Link>
        <Link href="/chat" className="rounded-full border border-line px-6 py-3 font-semibold">
          Open Mama&rsquo;s chat
        </Link>
      </div>
      <p className="mt-10 rounded-2xl border border-line px-5 py-4 text-muted">
        <span className="font-semibold text-foreground">I&rsquo;m Mama:</span> ask your child to set up CarePurse and send you the link.
      </p>
      <Footer />
    </main>
  );
}

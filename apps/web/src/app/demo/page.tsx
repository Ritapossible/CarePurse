// Demo view for the judges: Mama's chat on the left, the live Agent & x402 Log on the right.
import AgentLog from "@/components/AgentLog";
import Chat from "@/components/Chat";
import Footer from "@/components/Footer";
import SiteHeader from "@/components/SiteHeader";

export default function DemoPage() {
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 pt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-[0.25em] text-muted">Live demo</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mama’s chat and Mhasibu’s x402 log</h1>
          </div>
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <span className="h-2 w-2 rounded-full bg-live" /> Stellar Testnet
          </span>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,420px)_1fr]">
          <Chat />
          <AgentLog />
        </div>
        <Footer />
      </main>
    </div>
  );
}

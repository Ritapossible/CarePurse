// Demo view for the judges: Mama's chat on the left, the live Agent & x402 Log on the right.
import AgentLog from "@/components/AgentLog";
import Chat from "@/components/Chat";
import Footer from "@/components/Footer";

export default function DemoPage() {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-6xl flex-col px-4 pt-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">
          CarePurse <span className="font-normal text-muted">· Mama&rsquo;s chat and Mhasibu&rsquo;s x402 log</span>
        </h1>
        <span className="text-sm text-muted">Stellar Testnet</span>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,420px)_1fr]">
        <Chat />
        <AgentLog />
      </div>
      <Footer />
    </main>
  );
}

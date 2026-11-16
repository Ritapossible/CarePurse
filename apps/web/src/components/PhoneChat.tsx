// A still of Mama's chat for the landing page. The words are from a real test run on Stellar Testnet.
type Line = { from: "mama" | "mhasibu"; text: string };

const LINES: Line[] = [
  { from: "mama", text: "Abeg, light don almost finish" },
  { from: "mhasibu", text: "I fit buy light for meter 1111111111111:\n1) ₦500\n2) ₦1,000\n3) ₦2,000\n4) ₦5,000" },
  { from: "mama", text: "1" },
  { from: "mhasibu", text: "Done! ₦500 light. Your token na:" },
];

export default function PhoneChat() {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[44px] border border-line bg-foreground p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
      <div className="overflow-hidden rounded-[36px] bg-background">
        <div className="flex justify-center pt-3">
          <div className="h-6 w-24 rounded-full bg-foreground" />
        </div>
        <div className="flex items-center gap-3 border-b border-line px-5 pb-4 pt-4">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">M</div>
          <div className="leading-tight">
            <div className="font-semibold">Mhasibu</div>
            <div className="text-xs text-muted">Light, airtime and data</div>
          </div>
        </div>
        <div className="space-y-2.5 bg-surface px-4 py-5 text-[15px] leading-snug">
          {LINES.map((l, i) => (
            <div key={i} className={`flex ${l.from === "mama" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 ${
                  l.from === "mama" ? "rounded-br-md bg-foreground text-background" : "rounded-bl-md border border-line bg-background"
                }`}
              >
                {l.text}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-foreground bg-background px-4 py-3">
            <div className="flex justify-between text-xs text-muted">
              <span>Light token</span>
              <span>79.9 kWh</span>
            </div>
            <div className="mt-1 whitespace-nowrap font-mono text-[15px] font-semibold">2636 2054 4059 8275 7802</div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <div className="flex-1 rounded-[10px] border border-line px-4 py-2 text-sm text-muted">Type a message</div>
          <div className="rounded-[10px] bg-foreground px-4 py-2 text-sm font-medium text-background">Send</div>
        </div>
      </div>
    </div>
  );
}

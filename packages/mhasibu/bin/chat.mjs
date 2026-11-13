// Chat with Mhasibu as Mama, in the terminal. The gateway must be running (services/gateway: npm start).
//   npm run chat                     → interactive
//   npm run chat -- "Abeg, light don almost finish" "1"   → send these messages and exit
import readline from "node:readline/promises";
import { createMhasibu } from "../src/mhasibu.mjs";

const verbose = !process.argv.includes("--quiet");
const scripted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const mhasibu = createMhasibu({
  log: (e) => {
    if (!verbose) return;
    if (e.type === "paid") console.log(`   · paid on Stellar testnet: ${e.link}`);
    else if (e.type === "quote") console.log(`   · 402 received: ${e.amount} base units to ${e.payTo.slice(0, 6)}…`);
    else if (e.type === "refused") console.log(`   · refused by rule "${e.rule}": ${e.reason}`);
    else if (e.type === "notify-guardian") console.log(`   · guardian notified (${e.kind})`);
    else if (e.type === "payment-failed") console.log(`   · payment failed: ${e.message}`);
  },
});

console.log(`Mhasibu (${mhasibu.understander}) · Live Stellar Testnet payment · sandbox utility fulfilment\n`);
const send = async (text) => {
  console.log(`Mama: ${text}`);
  console.log(`Mhasibu: ${(await mhasibu.handle("demo", text)).replace(/\n/g, "\n         ")}\n`);
};

if (scripted.length) {
  for (const text of scripted) await send(text);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const text = (await rl.question("Mama: ")).trim();
    if (!text || text === "/quit") break;
    process.stdout.write("\x1b[1A\x1b[2K");
    await send(text);
  }
  rl.close();
}

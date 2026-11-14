// Regenerates docs/money-flow.excalidraw: node docs/money-flow.build.mjs docs  (then export it from excalidraw.com, or edit the .excalidraw there)
// Builds docs/money-flow.excalidraw: the CarePurse money flow, Excalidraw style.
import fs from "node:fs";
let seed = 1000;
const els = [];
const base = (o) => ({ angle: 0, opacity: 100, groupIds: [], frameId: null, roughness: 1, seed: seed++, version: 1, versionNonce: seed * 7,
  isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, strokeStyle: "solid", strokeWidth: 2, fillStyle: "solid", backgroundColor: "transparent", ...o });
const id = () => `e${seed}`;
const FONT = 5; // Excalifont
const estW = (text, size) => Math.max(...text.split("\n").map((l) => l.length)) * size * 0.56;
const estH = (text, size) => text.split("\n").length * size * 1.25;

function text(x, y, t, { size = 20, color = "#1e1e1e", align = "left", w } = {}) {
  const width = w ?? estW(t, size), height = estH(t, size);
  const left = align === "center" ? x - width / 2 : x;
  els.push(base({ id: id(), type: "text", x: left, y, width, height, text: t, originalText: t, fontSize: size, fontFamily: FONT,
    textAlign: align, verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25, strokeColor: color, roundness: null }));
}
function box(x, y, w, h, title, sub, c, { dashed = false } = {}) {
  els.push(base({ id: id(), type: "rectangle", x, y, width: w, height: h, strokeColor: c.stroke, backgroundColor: c.bg,
    fillStyle: dashed ? "hachure" : "solid", strokeStyle: dashed ? "dashed" : "solid", strokeWidth: 2, roundness: { type: 3 } }));
  text(x + w / 2, y + 16, title, { size: 22, color: c.stroke, align: "center" });
  text(x + w / 2, y + 50, sub, { size: 16, color: "#343a40", align: "center" });
}
function arrow(points, { color = "#1e1e1e", width = 2, dashed = false, label, lx, ly, lsize = 16, lcolor, twoWay = false } = {}) {
  const [x0, y0] = points[0];
  const rel = points.map(([x, y]) => [x - x0, y - y0]);
  const xs = rel.map((p) => p[0]), ys = rel.map((p) => p[1]);
  els.push(base({ id: id(), type: "arrow", x: x0, y: y0, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
    points: rel, strokeColor: color, strokeWidth: width, strokeStyle: dashed ? "dashed" : "solid", roundness: points.length > 2 ? null : { type: 2 },
    lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: twoWay ? "arrow" : null, endArrowhead: "arrow", elbowed: false }));
  if (label) text(lx, ly, label, { size: lsize, color: lcolor ?? color });
}

const C = {
  purple: { stroke: "#6741d9", bg: "#e5dbff" }, yellow: { stroke: "#e67700", bg: "#fff3bf" },
  green: { stroke: "#2b8a3e", bg: "#d3f9d8" }, blue: { stroke: "#1971c2", bg: "#d0ebff" },
  teal: { stroke: "#0c8599", bg: "#c5f6fa" }, grey: { stroke: "#495057", bg: "#f1f3f5" },
  orange: { stroke: "#d9480f", bg: "#ffe8cc" }, red: { stroke: "#c92a2a", bg: "#ffe3e3" },
};
const USDC = "#2b8a3e", MSG = "#1e1e1e", PLAN = "#c92a2a";

// Title
text(40, 10, "CarePurse: how the money moves", { size: 36, color: "#1e1e1e" });
text(40, 60, "Live Stellar Testnet payment · sandbox utility fulfilment   ·   example: Mama buys ₦500 of light (0.34 USDC)", { size: 18, color: "#495057" });

// Parties
box(40, 130, 330, 130, "Adaeze (daughter abroad)", "guardian · funds the purse\nsets limits · saves Mama's meter", C.purple);
box(560, 130, 360, 130, "Purse contract (Soroban)", "holds Mama's USDC\nenforces caps + saved meter ON-CHAIN", C.yellow);
box(40, 470, 330, 130, "Mama in Lagos", "chats in English or Pidgin\n“Abeg, light don almost finish”", C.green);
box(560, 470, 360, 130, "Mhasibu (AI agent)", "checks every rule in code\nwallet holds 0 between top-ups", C.blue);
box(1110, 260, 330, 120, "x402 facilitator", "verifies + settles on Stellar\npays the XLM network fee", C.grey);
box(1110, 470, 330, 130, "CarePurse gateway", "platform wallet GDFFLJ…7CAA\nanswers HTTP 402 · gets paid", C.teal);
box(1110, 720, 330, 120, "VTpass (sandbox)", "issues the token, airtime\nor data · naira wallet", C.orange);
box(1560, 590, 300, 120, "Off-ramp", "USDC → naira\n(Nigerian anchor / exchange)", C.red, { dashed: true });

// ① Adaeze deposits USDC into the purse
arrow([[370, 195], [560, 195]], { color: USDC, width: 3, label: "① deposit USDC", lx: 395, ly: 160, lsize: 18 });
// ② Mama asks Mhasibu
arrow([[370, 535], [560, 535]], { color: MSG, label: "② asks, then\nreplies “1” (₦500)", lx: 385, ly: 480 });
// ③ contract releases exactly the top-up
arrow([[740, 260], [740, 470]], { color: USDC, width: 3, label: "③ buy(): caps + saved meter OK\n→ releases exactly 0.34 USDC", lx: 755, ly: 330, lsize: 18 });
// ④ x402 payment to the platform
arrow([[920, 520], [1110, 520]], { color: USDC, width: 3, label: "④ x402 USDC\n402 · sign · retry", lx: 935, ly: 448, lsize: 16 });
// ⑤ facilitator settles
arrow([[1275, 470], [1275, 380]], { color: MSG, twoWay: true, label: "⑤ verify + settle", lx: 1290, ly: 410 });
// ⑥ fulfil with VTpass
arrow([[1275, 600], [1275, 720]], { color: MSG, label: "⑥ buy ₦500 of light", lx: 1290, ly: 645 });
// ⑦ token back to Mama
arrow([[1110, 790], [205, 790], [205, 600]], { color: MSG, label: "⑦ token 2636 2054 4059 8275 7802 shown in Mama's chat", lx: 380, ly: 800 });
// ⑧ receipt to Adaeze
arrow([[600, 470], [300, 260]], { color: "#868e96", label: "⑧ receipt +\nStellar tx link", lx: 440, ly: 300 });
// Production plan (not wired yet)
arrow([[1440, 540], [1700, 540], [1700, 590]], { color: PLAN, dashed: true, label: "platform sells USDC", lx: 1470, ly: 505 });
arrow([[1700, 710], [1700, 780], [1440, 780]], { color: PLAN, dashed: true, label: "refills the naira float", lx: 1470, ly: 795 });

// Legend
const LY = 880;
els.push(base({ id: id(), type: "rectangle", x: 40, y: LY - 15, width: 1820, height: 110, strokeColor: "#ced4da", backgroundColor: "#f8f9fa", roundness: { type: 3 }, strokeWidth: 1 }));
arrow([[70, LY + 15], [150, LY + 15]], { color: USDC, width: 3 });
text(165, LY + 2, "USDC moves on Stellar testnet (live today)", { size: 18, color: USDC });
arrow([[620, LY + 15], [700, LY + 15]], { color: MSG });
text(715, LY + 2, "messages and data", { size: 18, color: MSG });
arrow([[960, LY + 15], [1040, LY + 15]], { color: PLAN, dashed: true });
text(1055, LY + 2, "production plan (not wired yet)", { size: 18, color: PLAN });
text(70, LY + 45, "If any rule fails at ③ (over the cap, wrong meter, paused), the contract refuses and no USDC moves. Mhasibu's wallet never holds more than one top-up.", { size: 16, color: "#495057" });

const scene = { type: "excalidraw", version: 2, source: "https://excalidraw.com", elements: els, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {} };
fs.mkdirSync(process.argv[2], { recursive: true });
fs.writeFileSync(`${process.argv[2]}/money-flow.excalidraw`, JSON.stringify(scene, null, 2));
console.log(`${els.length} elements`);

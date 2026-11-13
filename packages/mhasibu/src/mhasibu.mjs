// Mhasibu: one message in from Mama, one reply out.
//
//   Mama: "Abeg, light don almost finish"
//   → understand (Claude or scripted) → work out what she may spend (limits + balance)
//   → options from the gateway, up to that amount → "1) ₦2,000  2) ₦5,000  0) Cancel"
//   Mama: "2"
//   → order → 402 → check the 402 against the order (allowlist, quoted price) → run every rule
//   → pay over x402 on Stellar testnet → token in the chat → receipt for the guardian
//
// "The AI proposes, the code decides": the model only classifies. Every amount, rule and payment is code.
import { config as defaultConfig, explorer } from "./config.mjs";
import { checkPurchase, headroom } from "./limits.mjs";
import { createPurseStore } from "./purses.mjs";
import { createWallet } from "./wallet.mjs";
import { createUnderstander } from "./understand.mjs";
import { say } from "./replies.mjs";

const MINUTE = 60_000;

export function createMhasibu({
  config = defaultConfig,
  purses = createPurseStore(config.pursesFile),
  wallet = createWallet(config),
  understander = createUnderstander(config.llm),
  clock = () => Date.now(),
  log = () => {},
} = {}) {
  const notifyGuardian = (purse, kind, text) => {
    purses.update(purse.id, (p) => p.notifications.push({ at: new Date(clock()).toISOString(), kind, text, read: false }));
    log({ type: "notify-guardian", kind, text });
  };
  const remember = (purse, from, text) => purses.update(purse.id, (p) => p.history.push({ at: new Date(clock()).toISOString(), from, text }));

  async function offer(purse, utility, lang) {
    const now = clock();
    if (purse.paused) return say.paused(lang, { guardian: purse.guardian.name });
    const balanceNgn = await wallet.balanceNgn();
    const room = headroom(purse, utility, { balanceNgn, now });
    const options = room.maxNgn > 0 ? await wallet.options(utility, room.maxNgn) : [];
    if (!options.length) {
      if (room.tightest.rule === "purse balance") {
        notifyGuardian(purse, "low-balance", `Mama asked for ${utility}, but the purse balance is too low.`);
        return say.lowBalance(lang, { guardian: purse.guardian.name });
      }
      notifyGuardian(purse, "limit-reached", `Mama asked for ${utility}, but the ${room.tightest.rule} limit is reached.`);
      return say.capReached(lang, { utility, guardian: purse.guardian.name, period: room.tightest.period });
    }
    const recent = purse.spends.filter((s) => s.utility === utility && now - Date.parse(s.at) < config.duplicateWindowMinutes * MINUTE).at(-1);
    purses.update(purse.id, (p) => { p.pending = { utility, options: options.map((o) => o.ngn), expiresAt: new Date(now + config.optionsTtlMinutes * MINUTE).toISOString() }; });
    const destinationLabel = utility === "electricity" ? `meter ${purse.destinations.electricity}` : purse.destinations[utility];
    return say.options(lang, { utility, options, destinationLabel, recentNgn: recent?.ngn });
  }

  async function buy(purse, utility, ngn, lang) {
    const destination = purse.destinations[utility];
    const balanceNgn = await wallet.balanceNgn();
    // Rules before ordering (destination, paused, limits, balance).
    let verdict = checkPurchase({ purse, utility, ngn, destination, balanceNgn, now: clock() });
    if (!verdict.ok) return refuse(purse, utility, verdict, lang);

    const { order, payPath } = await wallet.createOrder({ utility, ngn, destination });
    const quote = await wallet.quote(payPath);
    log({ type: "quote", utility, ngn, amount: quote.amount, payTo: quote.payTo });
    // Every rule again, now with the real 402: allowlist and quoted price first.
    verdict = checkPurchase({ purse, utility, ngn, destination, quote, order, expected: wallet.expected, balanceNgn, now: clock() });
    if (!verdict.ok) return refuse(purse, utility, verdict, lang);

    try {
      const { result, tx } = await wallet.pay(quote.url, quote);
      purses.update(purse.id, (p) => p.spends.push({ at: new Date(clock()).toISOString(), utility, ngn, order: order.id, tx }));
      notifyGuardian(purse, "receipt", `Mama bought ₦${ngn.toLocaleString("en-NG")} of ${utility}. ${explorer.tx(tx)}`);
      log({ type: "paid", utility, ngn, tx, link: explorer.tx(tx) });
      return say.delivered(lang, { utility, ngn, token: result.token, units: result.units });
    } catch (err) {
      log({ type: "payment-failed", message: err.message });
      return say.failed(lang);
    }
  }

  function refuse(purse, utility, verdict, lang) {
    log({ type: "refused", ...verdict });
    if (verdict.rule === "paused") return say.paused(lang, { guardian: purse.guardian.name });
    if (verdict.rule === "purse balance") {
      notifyGuardian(purse, "low-balance", `A ${utility} top-up was refused: the purse balance is too low.`);
      return say.lowBalance(lang, { guardian: purse.guardian.name });
    }
    if (["allowlist", "quoted price", "destination"].includes(verdict.rule)) {
      notifyGuardian(purse, "blocked", `Mhasibu refused a payment (${verdict.rule}: ${verdict.reason}).`);
      return say.refused(lang);
    }
    notifyGuardian(purse, "limit-reached", `A ${utility} top-up was refused: ${verdict.reason}.`);
    return say.capReached(lang, { utility, guardian: purse.guardian.name, period: verdict.period });
  }

  return {
    understander: understander.name,

    async handle(purseId, text) {
      const purse = purses.get(purseId);
      if (!purse) throw new Error(`no purse ${purseId}`);
      const lang = purse.mama.language;
      remember(purse, "mama", text);
      const reply = await respond(purse, text, lang);
      remember(purses.get(purseId), "mhasibu", reply);
      return reply;
    },
  };

  // Any phone or meter number in the message must be one the guardian saved.
  // This runs whatever the understander said, so no model can talk its way to another number.
  function foreignNumber(purse, text) {
    const saved = new Set(Object.values(purse.destinations));
    return (text.match(/\d{10,13}/g) ?? []).some((n) => !saved.has(n));
  }

  async function respond(purse, text, lang) {
    const understood = await understander.understand(text);
    const { intent, utility, choice } = foreignNumber(purse, text) ? { ...understood, intent: "change_rules" } : understood;
    log({ type: "understood", intent, utility, choice });
    const pending = purse.pending;
    const pendingLive = pending && Date.parse(pending.expiresAt) > clock();

    if (intent === "cancel" || (intent === "choose" && choice === 0)) {
      purses.update(purse.id, (p) => { p.pending = null; });
      return say.cancelled(lang);
    }
    if (intent === "choose") {
      if (!pending) return say.help(lang, { name: purse.mama.name, guardian: purse.guardian.name });
      if (!pendingLive) { purses.update(purse.id, (p) => { p.pending = null; }); return say.expired(lang); }
      const ngn = pending.options[choice - 1];
      if (!ngn) return say.notAnOption(lang);
      purses.update(purse.id, (p) => { p.pending = null; });
      return buy(purses.get(purse.id), pending.utility, ngn, lang);
    }
    if (intent === "buy" && utility) return offer(purse, utility, lang);
    if (intent === "check_balance") {
      const balanceNgn = await wallet.balanceNgn();
      const lines = ["electricity", "airtime", "data"].map((u) => ({ utility: u, maxNgn: headroom(purse, u, { balanceNgn, now: clock() }).maxNgn }));
      return say.balance(lang, { lines });
    }
    if (intent === "history") return say.history(lang, { spends: purse.spends });
    if (intent === "change_rules") {
      notifyGuardian(purse, "change-request", `Mama asked: "${text.slice(0, 200)}"`);
      return say.changeRules(lang, { guardian: purse.guardian.name });
    }
    return say.help(lang, { name: purse.mama.name, guardian: purse.guardian.name });
  }
}

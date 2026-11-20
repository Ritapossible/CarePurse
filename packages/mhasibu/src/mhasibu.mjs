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
import { checkPurchase, headroom, periodStart } from "./limits.mjs";
import { createPurseStore } from "./purses.mjs";
import { createWallet } from "./wallet.mjs";
import { createUnderstander, understandScripted } from "./understand.mjs";
import { say } from "./replies.mjs";
import { detectLanguage } from "./language.mjs";
import { parseDay } from "./days.mjs";
import { ContractRefused, orderRef } from "./purse-contract.mjs";

const MINUTE = 60_000;
// After this long, a signed x402 authorisation has expired, so a "fulfilling" order can no longer settle.
const SETTLE_WINDOW_MS = 30 * MINUTE;
// The one-digit menu shown with help and "I didn't understand" (same order as MENU in replies.mjs).
const MENU_CHOICES = [null, "electricity", "airtime", "data", "check_balance", "my_token", "history"];

export function createMhasibu({
  config = defaultConfig,
  purses = createPurseStore(config.pursesFile),
  wallet = createWallet(config),
  // One purse contract per family: the same wallet code, pointed at that purse's contract.
  walletFor = (contractId) => createWallet({ ...config, purseContractId: contractId }),
  understander = createUnderstander(config.llm),
  clock = () => Date.now(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => {},
} = {}) {
  // The wallet for a purse: its own contract if it has one (families who signed up), otherwise
  // the default one (the demo purse, PURSE_CONTRACT_ID).
  const wallets = new Map();
  const walletOf = (purse) => {
    if (!purse?.contractId || purse.contractId === config.purseContractId) return wallet;
    if (!wallets.has(purse.contractId)) wallets.set(purse.contractId, walletFor(purse.contractId));
    return wallets.get(purse.contractId);
  };
  // CarePurse's service fee (basis points). Mama never sees it; Adaeze's receipts do.
  const feeBps = config.serviceFeeBps ?? 0;
  const notifyGuardian = (purse, kind, text) => {
    purses.update(purse.id, (p) => p.notifications.push({ at: new Date(clock()).toISOString(), kind, text, read: false }));
    log({ type: "notify-guardian", kind, text });
  };
  const remember = (purse, from, text) => purses.update(purse.id, (p) => p.history.push({ at: new Date(clock()).toISOString(), from, text }));

  async function offer(purse, utility, lang) {
    // Don't even offer sizes while the last top-up is unsettled.
    if (purse.openOrder) return say.stillSettling(lang, { guardian: purse.guardian.name });
    const now = clock();
    if (purse.paused) return say.paused(lang, { guardian: purse.guardian.name });
    const balanceNgn = await walletOf(purse).balanceNgn({ includeAgent: Boolean(purse.openOrder) });
    const room = headroom(purse, utility, { balanceNgn, now, feeBps });
    const options = room.maxNgn > 0 ? await walletOf(purse).options(utility, room.maxNgn, purse.providers?.network) : [];
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
    // Never start a purchase while the last one is unsettled (one open order at a time).
    if (purse.openOrder) return say.stillSettling(lang, { guardian: purse.guardian.name });
    const destination = purse.destinations[utility];
    const balanceNgn = await walletOf(purse).balanceNgn({ includeAgent: Boolean(purse.openOrder) });
    // Rules before ordering (destination, paused, limits, balance).
    let verdict = checkPurchase({ purse, utility, ngn, destination, balanceNgn, now: clock(), feeBps });
    if (!verdict.ok) return refuse(purse, utility, verdict, lang);

    const providers = purse.providers ?? {};
    const via = utility === "electricity" ? { disco: providers.disco, contactPhone: purse.mama.phone } : { network: providers.network };
    const { order, payPath } = await walletOf(purse).createOrder({ utility, ngn, destination, ...via });
    log({ type: "order", id: order.id, utility, ngn, payPath });
    const quote = await walletOf(purse).quote(payPath);
    log({ type: "quote", utility, ngn, feeNgn: order.feeNgn, chargedNgn: order.chargedNgn, amount: quote.amount, payTo: quote.payTo, asset: quote.asset, network: quote.network, url: quote.url });
    // Every rule again, now with the real 402: allowlist and quoted price first.
    verdict = checkPurchase({ purse, utility, ngn, destination, quote, order, expected: walletOf(purse).expected, balanceNgn, now: clock(), feeBps });
    if (!verdict.ok) return refuse(purse, utility, verdict, lang);
    log({ type: "rules-ok", utility, ngn });

    // Phase 2: the purse contract checks the guardian's rules on-chain and releases exactly this amount.
    // One open order at a time (the contract enforces it too). Write the open order down BEFORE the
    // release, so even a crash or a timeout right after it leaves a trace to settle.
    let release = null;
    // A payment we signed and then gave up on stays valid until its window ends. Release no new money
    // to the agent wallet before then, so that old signature can never take it.
    const holdUntil = Date.parse(purses.get(purse.id).payHoldUntil ?? "") || 0;
    if (walletOf(purse).release && clock() < holdUntil) {
      log({ type: "pay-hold", seconds: Math.ceil((holdUntil - clock()) / 1000) });
      return say.waitAMinute(lang);
    }
    if (walletOf(purse).release) {
      const ref = orderRef(order.id);
      purses.update(purse.id, (p) => { p.openOrder = { orderId: order.id, ref, utility, ngn, amount: quote.amount, at: new Date(clock()).toISOString(), released: false, paid: false, attempts: 0 }; });
      await purses.flush?.();
      log({ type: "contract-check", utility, amount: quote.amount });
      try {
        release = await walletOf(purse).release({ utility, destination, amount: quote.amount, orderId: order.id });
        purses.update(purse.id, (p) => { p.openOrder.released = true; p.openOrder.releaseTx = release.tx; });
        log({ type: "contract-ok", tx: release.tx, link: explorer.tx(release.tx) });
      } catch (err) {
        if (!(err instanceof ContractRefused)) {
          // A timeout or send error can come AFTER the release landed on-chain. Keep the open order
          // (released: unknown); the next message asks the chain and settles it. Don't say "not charged".
          log({ type: "release-unknown", message: err.message });
          return say.checking(lang, { guardian: purse.guardian.name });
        }
        // Refused in simulation: nothing moved.
        purses.update(purse.id, (p) => { p.openOrder = null; });
        log({ type: "contract-refused", rule: err.rule, code: err.code });
        if (err.rule === "order open") {
          // The chain has an open order this purse has no record of (lost data). Settle it from the
          // chain's reference, then she can try again.
          await settleChainOrder(purses.get(purse.id));
          return say.stillSettling(lang, { guardian: purse.guardian.name });
        }
        const period = { "per day": "day", "per week": "week", "per month": "month", "purse month": "month" }[err.rule];
        return refuse(purse, utility, { ok: false, rule: err.rule, reason: `the purse contract refused (${err.rule})`, period, onChain: true }, lang);
      }
    }

    // From here a signed payment may exist until its window ends (+30 s for ledger timing).
    const signedUntil = new Date(clock() + ((quote.maxTimeoutSeconds ?? 300) + 30) * 1000).toISOString();
    try {
      log({ type: "signing", amount: quote.amount, payTo: quote.payTo });
      const { result, tx } = await walletOf(purse).pay(quote.url, quote);
      // Keep what was delivered with the purchase, so Mama can always see her token again.
      const kept = deliveredFields(result);
      purses.update(purse.id, (p) => {
        p.spends.push({ at: new Date(clock()).toISOString(), utility, ngn, ...feeFields(order), order: order.id, tx, releaseTx: release?.tx, ...kept });
        if (p.openOrder) p.openOrder.paid = true;
      });
      log({ type: "paid", utility, ngn, tx, link: explorer.tx(tx) });
      // The token goes in Adaeze's receipt too, so she can read it to Mama on the phone.
      notifyGuardian(purse, "receipt", `Mama bought ₦${ngn.toLocaleString("en-NG")} of ${utility}.${feeLine(order)}${result.token ? ` Token: ${result.token}${result.units ? ` (${result.units})` : ""}.` : ""} ${explorer.tx(tx)}`);
      // Close the order on-chain. If that fails, it's retried on the next message (the order is
      // already marked paid, so it will be committed, never refunded).
      if (release) await commitOpen(purses.get(purse.id));
      return say.delivered(lang, { utility, ngn, token: result.token, units: result.units });
    } catch (err) {
      log({ type: "payment-failed", message: err.message });
      purses.update(purse.id, (p) => { p.payHoldUntil = signedUntil; });
      if (!release) return err.retryLater ? say.tryLater(lang) : say.failed(lang);
      // The contract released the money to Mhasibu's wallet. Settle it from the facts: if the
      // provider issued a token anyway, Mama keeps it and the gateway is paid; otherwise refund.
      const outcome = await resolveReleased(purses.get(purse.id), purses.get(purse.id).openOrder, { refundAttempts: 3 });
      if (outcome.kind === "refunded") return err.retryLater ? say.tryLater(lang) : say.failed(lang);
      if (outcome.kind === "delivered") return say.delivered(lang, { utility, ngn, token: outcome.token, units: outcome.units });
      // Still unknown: count it like the chain does, keep the open order, settle on the next message.
      purses.update(purse.id, (p) => {
        if (!p.spends.some((s) => s.order === order.id)) p.spends.push({ at: new Date(clock()).toISOString(), utility, ngn, order: order.id, releaseTx: release.tx, unconfirmed: true });
      });
      notifyGuardian(purse, "check-payment", `A ₦${ngn.toLocaleString("en-NG")} ${utility} top-up (order ${order.id}) isn't settled yet. Mhasibu keeps retrying on Mama's next message; no action needed unless this repeats.`);
      return say.checking(lang, { guardian: purse.guardian.name });
    }
  }

  // The fee on an order, for the purchase record and Adaeze's receipt (never Mama's chat).
  const feeFields = (order) => (order?.feeNgn !== undefined ? { feeNgn: order.feeNgn, chargedNgn: order.chargedNgn } : {});
  const naira = (n) => `₦${Number(n).toLocaleString("en-NG")}`;
  const feeLine = (order) => (order?.feeNgn ? ` Charged ${naira(order.chargedNgn)} (${naira(order.ngn)} + ${naira(order.feeNgn)} service fee).` : "");

  const deliveredFields = (r = {}) => Object.fromEntries(Object.entries({ token: r.token, units: r.units, reference: r.reference, bundle: r.bundle }).filter(([, v]) => v != null));

  async function commitOpen(purse) {
    const open = purse.openOrder;
    if (!open || !walletOf(purse).commitRef) { purses.update(purse.id, (p) => { p.openOrder = null; }); return true; }
    try {
      const done = await walletOf(purse).commitRef(open.ref ?? orderRef(open.orderId));
      purses.update(purse.id, (p) => { p.openOrder = null; });
      log({ type: "committed", tx: done.tx, link: explorer.tx(done.tx) });
      return true;
    } catch (err) {
      if (err instanceof ContractRefused && err.rule === "already committed") { purses.update(purse.id, (p) => { p.openOrder = null; }); return true; }
      log({ type: "commit-failed", message: err.message });
      return false;
    }
  }

  // Settle an order whose USDC the contract released, from the facts:
  //   gateway says delivered                    → keep the token, commit
  //   provider issued a token, settlement failed → Mama keeps the token, pay the gateway that exact
  //                                               amount directly (recovery only), commit
  //   still in flight (under 15 minutes)         → wait
  //   otherwise (failed, expired, unknown)       → refund to the purse
  // `open` may come from the purse record or only from the chain (orderId unknown).
  // Returns { kind: "delivered" | "refunded" | "pending", token?, units? }.
  async function resolveReleased(purse, open, { refundAttempts = 1 } = {}) {
    const ref = open.ref ?? orderRef(open.orderId);
    const status = await (open.orderId ? walletOf(purse).orderStatus(open.orderId) : walletOf(purse).orderByRef(ref)).catch(() => undefined);
    if (status === undefined) return { kind: "pending" }; // gateway unreachable: don't guess
    const orderId = open.orderId ?? status?.id ?? ref.slice(0, 16);
    const issued = status?.issued ?? (status?.token ? deliveredFields(status) : null);
    const keep = (extra) => purses.update(purse.id, (p) => {
      p.spends = p.spends.filter((s) => s.order !== orderId);
      p.spends.push({ at: open.at ?? new Date(clock()).toISOString(), utility: open.utility, ngn: open.ngn ?? status?.ngn, ...feeFields(status), order: orderId, releaseTx: open.releaseTx, ...deliveredFields(issued ?? {}), ...extra });
      if (p.openOrder) p.openOrder.paid = true;
    });

    if (status?.status === "delivered") {
      keep({ tx: status.txHash });
      notifyGuardian(purse, "receipt", `Confirmed: Mama's ₦${(open.ngn ?? status.ngn).toLocaleString("en-NG")} ${open.utility} top-up went through.${issued?.token ? ` Token: ${issued.token}.` : ""}`);
      await commitRef(purse, ref);
      return { kind: "delivered", token: issued?.token, units: issued?.units };
    }
    // Could the x402 payment still settle? Then do nothing yet: neither a second payment nor a refund.
    //   created, not expired → the payment may still start (the gateway refuses expired orders)
    //   fulfilling, under 30 minutes → the facilitator may still be settling (a signed x402
    //   authorisation expires within minutes, so after 30 it can't settle any more)
    const startedAt = Date.parse(status?.createdAt ?? open.at ?? "");
    if (status?.status === "created" && !(Date.parse(status.expiresAt) < clock())) return { kind: "pending" };
    if (status?.status === "fulfilling" && !(clock() - startedAt > SETTLE_WINDOW_MS)) return { kind: "pending" };

    // Settlement can't happen any more. If the provider issued a token anyway (failed settlement, or
    // stuck past the window), Mama keeps it and the gateway is paid that exact amount directly:
    // the only recovery payment. A normal top-up is always paid over x402.
    if (issued && (issued.token || issued.reference) && ["failed", "fulfilling"].includes(status?.status)) {
      try {
        const paid = await walletOf(purse).payGatewayDirect(open.amount);
        log({ type: "paid-direct", tx: paid.tx, link: explorer.tx(paid.tx), amount: open.amount });
        keep({ tx: paid.tx, paidDirect: true });
        notifyGuardian(purse, "receipt", `Mama's ₦${(open.ngn ?? status.ngn).toLocaleString("en-NG")} ${open.utility} was delivered but the x402 settlement failed, so Mhasibu paid the gateway directly.${issued.token ? ` Token: ${issued.token}.` : ""} ${explorer.tx(paid.tx)}`);
        await commitRef(purse, ref);
        return { kind: "delivered", token: issued.token, units: issued.units };
      } catch (err) {
        log({ type: "paid-direct-failed", message: err.message });
        return { kind: "pending" };
      }
    }
    // Otherwise (failed with nothing issued, created but expired, or unknown to the gateway): refund.
    for (let i = 0; i < refundAttempts; i++) {
      try {
        const back = await walletOf(purse).refundRef(ref);
        log({ type: "refunded", tx: back.tx, link: explorer.tx(back.tx), amount: open.amount });
        purses.update(purse.id, (p) => { p.spends = p.spends.filter((s) => s.order !== orderId); p.openOrder = null; });
        return { kind: "refunded" };
      } catch (err) {
        log({ type: "refund-failed", message: err.message, attempt: i + 1 });
        if (err instanceof ContractRefused) break;
        if (i < refundAttempts - 1) await wait(2_000 * (i + 1));
      }
    }
    return { kind: "pending" };
  }

  async function commitRef(purse, ref) {
    try {
      const done = await walletOf(purse).commitRef(ref);
      log({ type: "committed", tx: done.tx, link: explorer.tx(done.tx) });
    } catch (err) {
      if (!(err instanceof ContractRefused && err.rule === "already committed")) { log({ type: "commit-failed", message: err.message }); return false; }
    }
    purses.update(purse.id, (p) => { p.openOrder = null; });
    return true;
  }

  // An open order on the chain that this purse has no record of (its id was lost): read the amount
  // from the contract, the outcome from the gateway (by reference), and settle it.
  async function settleChainOrder(purse) {
    const ref = await walletOf(purse).openOrderRef().catch(() => undefined);
    if (!ref) return ref === null;
    const rec = await walletOf(purse).contractOrder(ref).catch(() => null);
    if (!rec) return false;
    const outcome = await resolveReleased(purse, { ref, utility: rec.utility, amount: rec.amount });
    if (outcome.kind === "pending") notifyGuardian(purse, "check-payment", `Mhasibu found an unsettled order on the purse contract (${ref.slice(0, 12)}…) and couldn't settle it yet. It will keep trying.`);
    return outcome.kind !== "pending";
  }

  // Before anything else on each message: settle the open order, if any. Returns true when clear.
  async function settleOpenOrder(purse) {
    const open = purse.openOrder;
    if (!open) return true;
    if (!walletOf(purse).release) { purses.update(purse.id, (p) => { p.openOrder = null; }); return true; }
    if (open.paid) return commitOpen(purse);
    const ref = open.ref ?? orderRef(open.orderId);
    if (!open.released) {
      // Timed out or crashed before hearing back: ask the chain whether the release happened.
      const onChain = await walletOf(purse).openOrderRef().catch(() => undefined);
      if (onChain === undefined) return false;
      if (onChain !== ref) {
        purses.update(purse.id, (p) => { p.openOrder = null; }); // our release never happened
        return onChain === null ? true : settleChainOrder(purses.get(purse.id));
      }
      purses.update(purse.id, (p) => { p.openOrder.released = true; });
    }
    const outcome = await resolveReleased(purses.get(purse.id), purses.get(purse.id).openOrder);
    if (outcome.kind !== "pending") return true;
    purses.update(purse.id, (p) => { p.openOrder.attempts = (p.openOrder.attempts ?? 0) + 1; });
    if (purses.get(purse.id).openOrder.attempts === 3) notifyGuardian(purse, "check-payment", `Mhasibu still can't settle order ${open.orderId}. It keeps trying. Only if Mhasibu's key is lost, close it with guardian_close (that doesn't return the USDC).`);
    return false;
  }

  function refuse(purse, utility, verdict, lang) {
    log({ type: "refused", ...verdict });
    if (verdict.rule === "paused") return say.paused(lang, { guardian: purse.guardian.name });
    if (verdict.rule === "purse balance") {
      notifyGuardian(purse, "low-balance", `A ${utility} top-up was refused: the purse balance is too low.`);
      return say.lowBalance(lang, { guardian: purse.guardian.name });
    }
    if (["allowlist", "quoted price", "destination", "order used", "bad amount", "no caps"].includes(verdict.rule)) {
      notifyGuardian(purse, "blocked", `${verdict.onChain ? "The purse contract" : "Mhasibu"} refused a payment (${verdict.rule}: ${verdict.reason}).`);
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
      // Answer in the language she just wrote in; a message with no sign ("1") keeps her last one.
      const seen = detectLanguage(text);
      if (seen && seen !== purse.mama.language) purses.update(purseId, (p) => { p.mama.language = seen; });
      const lang = seen ?? purse.mama.language ?? "en";
      remember(purse, "mama", text);
      log({ type: "mama", text });
      await settleOpenOrder(purses.get(purseId));
      const reply = await respond(purse, text, lang);
      log({ type: "reply", text: reply });
      remember(purses.get(purseId), "mhasibu", reply);
      // Stored before Mama sees it (a token is never shown but not kept). A database hiccup is
      // logged, not shown to her: the reply still goes out.
      await purses.flush?.().catch((err) => log({ type: "error", message: `could not store the chat yet: ${err.message}` }));
      return reply;
    },
  };

  // Any phone or meter number in the message must be one the guardian saved, and any request
  // for someone else ("my neighbour", "send ... to", "raise my limit") goes to the guardian.
  // This runs whatever the understander said, so no model can talk its way past it.
  function needsGuardian(purse, text) {
    const saved = new Set(Object.values(purse.destinations));
    if ((text.match(/\d{10,13}/g) ?? []).some((n) => !saved.has(n))) return true;
    return understandScripted(text).intent === "change_rules";
  }

  async function respond(purse, text, lang) {
    const understood = await understander.understand(text);
    const { intent, utility, choice } = needsGuardian(purse, text) ? { ...understood, intent: "change_rules" } : understood;
    log({ type: "understood", intent, utility, choice, by: understander.lastVia ?? "model" });
    const pending = purse.pending;
    const pendingLive = pending && Date.parse(pending.expiresAt) > clock();

    if (intent === "cancel" || (intent === "choose" && choice === 0)) {
      purses.update(purse.id, (p) => { p.pending = null; });
      return say.cancelled(lang);
    }
    if (intent === "choose") {
      if (!pending) return showMenu(purse, say.notUnderstood(lang));
      if (!pendingLive) { purses.update(purse.id, (p) => { p.pending = null; }); return say.expired(lang); }
      if (pending.menu) {
        const pick = MENU_CHOICES[choice];
        purses.update(purse.id, (p) => { p.pending = null; });
        if (!pick) return showMenu(purse, say.notAnOption(lang));
        if (pick === "check_balance") return balance(purse, lang);
        if (pick === "my_token") return lastToken(purse, lang);
        if (pick === "history") return history(purse, lang, "");
        return offer(purses.get(purse.id), pick, lang);
      }
      const ngn = pending.options[choice - 1];
      if (!ngn) return say.notAnOption(lang);
      purses.update(purse.id, (p) => { p.pending = null; });
      return buy(purses.get(purse.id), pending.utility, ngn, lang);
    }
    if (intent === "buy" && utility) return offer(purse, utility, lang);
    if (intent === "check_balance") return balance(purse, lang);
    if (intent === "history") return history(purse, lang, text, utility);
    if (intent === "my_token") return lastToken(purse, lang);
    if (intent === "change_rules") {
      notifyGuardian(purse, "change-request", `Mama asked: "${text.slice(0, 200)}"`);
      return say.changeRules(lang, { guardian: purse.guardian.name });
    }
    if (intent === "help") return showMenu(purse, say.help(lang, { name: purse.mama.name, guardian: purse.guardian.name }));
    // Not understood: say so and offer the one-digit menu. Nothing is ever bought on a guess.
    return showMenu(purse, say.notUnderstood(lang));
  }

  function showMenu(purse, reply) {
    purses.update(purse.id, (p) => { p.pending = { menu: true, expiresAt: new Date(clock() + config.optionsTtlMinutes * MINUTE).toISOString() }; });
    return reply;
  }

  // Her purchase history. A day or period in her words ("yesterday", "on 16 Nov", "last week"):
  // everything bought then, with the total. Otherwise the last 10 top-ups and this month's total.
  // Naming a utility ("did I buy light on Monday?") narrows it to that utility.
  function history(purse, lang, text, utility = null) {
    const range = parseDay(text, clock());
    if (range) {
      const spends = purse.spends.filter((s) => { const at = Date.parse(s.at); return at >= range.from && at < range.to && (!utility || s.utility === utility); });
      return say.historyFor(lang, { label: range.label, utility, spends, totalNgn: spends.reduce((sum, s) => sum + s.ngn, 0) });
    }
    const since = periodStart("month", clock());
    const monthNgn = purse.spends.filter((s) => Date.parse(s.at) >= since).reduce((sum, s) => sum + s.ngn, 0);
    return say.history(lang, { spends: purse.spends, monthNgn });
  }

  function lastToken(purse, lang) {
    const spend = [...purse.spends].reverse().find((s) => s.utility === "electricity" && s.token);
    return say.lastToken(lang, { spend });
  }

  async function balance(purse, lang) {
    const balanceNgn = await walletOf(purse).balanceNgn({ includeAgent: Boolean(purse.openOrder) });
    const lines = ["electricity", "airtime", "data"].map((u) => ({ utility: u, maxNgn: headroom(purse, u, { balanceNgn, now: clock(), feeBps }).maxNgn }));
    // Her balance in naira at face value: the fee is Adaeze's, so it is taken out, as in "purse balance".
    const purseNgn = Math.max(0, Math.floor((balanceNgn * 10_000) / (10_000 + feeBps)));
    return say.balance(lang, { purseNgn, lines });
  }
}

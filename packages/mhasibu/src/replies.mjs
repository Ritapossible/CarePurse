// Everything Mhasibu says, in English (en) and Nigerian Pidgin (pcm).
// Fixed templates: the model never writes these, so it can never invent an amount.
// Mama only ever sees naira, never USDC.
// Pidgin wording should be checked by a native speaker before the demo.

const naira = (n) => `₦${Number(n).toLocaleString("en-NG")}`;
const LABEL = { en: { electricity: "light", airtime: "airtime", data: "data" }, pcm: { electricity: "light", airtime: "airtime", data: "data" } };
const WHEN = {
  en: { day: "tomorrow", week: "on Monday", month: "next month" },
  pcm: { day: "tomorrow", week: "for Monday", month: "next month" },
};

// The menu Mama answers with one digit (same order as MENU_CHOICES in mhasibu.mjs).
const MENU = {
  en: "1) Light\n2) Airtime\n3) Data\n4) How much is left\n5) My last light token\n6) What I bought",
  pcm: "1) Light\n2) Airtime\n3) Data\n4) Wetin remain\n5) My last light token\n6) Wetin I don buy",
};

export const say = {
  options(lang, { utility, options, destinationLabel, recentNgn }) {
    const list = options.map((o, i) => `${i + 1}) ${naira(o.ngn)}`).join("\n");
    const u = LABEL[lang][utility];
    if (lang === "pcm") {
      const again = recentNgn ? `You don buy ${naira(recentNgn)} ${u} small time ago. You still want more?\n` : "";
      return `${again}I fit buy ${u} for ${destinationLabel}:\n${list}\n0) Cancel\nReply with the number.`;
    }
    const again = recentNgn ? `You bought ${naira(recentNgn)} of ${u} a short while ago. Do you want more?\n` : "";
    return `${again}I can buy ${u} for ${destinationLabel}:\n${list}\n0) Cancel\nReply with the number.`;
  },

  delivered(lang, { utility, ngn, token, units }) {
    if (utility === "electricity") {
      return lang === "pcm"
        ? `Done! ${naira(ngn)} light. Your token na:\n${token}\n(${units})`
        : `Done! ${naira(ngn)} of electricity. Your token is:\n${token}\n(${units})`;
    }
    return lang === "pcm" ? `Done! ${naira(ngn)} ${utility} don enter your line.` : `Done! ${naira(ngn)} of ${utility} has been sent to your line.`;
  },

  rulesOutdated(lang, { guardian }) {
    if (lang === "pcm") return `I no fit buy am now, but no be say you don pass your limit. ${guardian} need update your purse first. I don tell ${guardian}, try again after.`;
    return `I couldn't buy that one just now, but you haven't gone over your limit. ${guardian} needs to update your purse first. I've let ${guardian} know; please try again after.`;
  },

  capReached(lang, { utility, guardian, period }) {
    const when = period ? WHEN[lang][period] : null;
    const u = LABEL[lang][utility];
    if (lang === "pcm") return `The ${u} limit wey ${guardian} set don reach.${when ? ` E go open again ${when}.` : ""} I don tell ${guardian}.`;
    return `The ${u} limit ${guardian} set has been reached.${when ? ` It opens again ${when}.` : ""} I've let ${guardian} know.`;
  },

  // She asked for a specific amount. Within her limits: confirm it once. Over: say why, plainly,
  // then what she can have. Not a size we sell: the nearest sizes.
  confirmAmount(lang, { utility, ngn, destinationLabel }) {
    const u = LABEL[lang][utility];
    return lang === "pcm"
      ? `Make I buy ${naira(ngn)} ${u} for ${destinationLabel}?\n1) Yes, buy ${naira(ngn)}\n0) Cancel\nReply with the number.`
      : `Shall I buy ${naira(ngn)} of ${u} for ${destinationLabel}?\n1) Yes, buy ${naira(ngn)}\n0) Cancel\nReply with the number.`;
  },

  amountNotAllowed(lang, { utility, askedNgn, maxNgn, rule, guardian, options }) {
    const u = LABEL[lang][utility];
    const max = naira(maxNgn);
    const why = {
      en: {
        "per top-up": `${guardian} allows up to ${max} of ${u} at a time.`,
        "per day": `You have ${max} of ${u} left for today.`,
        "per week": `You have ${max} of ${u} left for this week.`,
        "per month": `You have ${max} of ${u} left for this month.`,
        "purse per month": `Your purse has ${max} left to spend this month.`,
        "purse balance": `Your purse only has enough for ${max} now.`,
      },
      pcm: {
        "per top-up": `${guardian} allow only ${max} ${u} at once.`,
        "per day": `Na ${max} ${u} remain for you today.`,
        "per week": `Na ${max} ${u} remain for you this week.`,
        "per month": `Na ${max} ${u} remain for you this month.`,
        "purse per month": `Na ${max} remain for your purse this month.`,
        "purse balance": `Money for your purse fit only buy ${max} now.`,
      },
    }[lang][rule] ?? "";
    const list = options.map((o, i) => `${i + 1}) ${naira(o)}`).join("\n");
    return lang === "pcm"
      ? `I no fit buy ${naira(askedNgn)} ${u}. ${why} I fit buy:\n${list}\n0) Cancel\nReply with the number.`
      : `I can't buy ${naira(askedNgn)} of ${u}. ${why} I can buy:\n${list}\n0) Cancel\nReply with the number.`;
  },

  notASize(lang, { utility, askedNgn, options }) {
    const u = LABEL[lang][utility];
    const list = options.map((o, i) => `${i + 1}) ${naira(o)}`).join("\n");
    return lang === "pcm"
      ? `I no fit buy exactly ${naira(askedNgn)} ${u}. See the ones wey dey:\n${list}\n0) Cancel\nReply with the number.`
      : `${naira(askedNgn)} isn't a size I can buy for ${u}. These are:\n${list}\n0) Cancel\nReply with the number.`;
  },

  whichUtility(lang, { askedNgn }) {
    return lang === "pcm"
      ? `Wetin make I buy ${naira(askedNgn)} for? Reply with a number:\n1) Light\n2) Airtime\n3) Data`
      : `What should I buy ${naira(askedNgn)} of? Reply with a number:\n1) Light\n2) Airtime\n3) Data`;
  },

  lowBalance(lang, { guardian }) {
    return lang === "pcm" ? `Money for your CarePurse no reach for this one. I don tell ${guardian} make she add more.` : `There isn't enough in your CarePurse for this. I've asked ${guardian} to add more.`;
  },

  paused(lang, { guardian }) {
    return lang === "pcm" ? `${guardian} don pause your CarePurse for now. Abeg talk to am.` : `${guardian} has paused your CarePurse for now. Please talk to her.`;
  },

  changeRules(lang, { guardian }) {
    return lang === "pcm"
      ? `Na only ${guardian} fit change numbers or limits. I don send your request give am.`
      : `Only ${guardian} can change numbers or limits. I've sent her your request.`;
  },

  notAnOption(lang) { return lang === "pcm" ? "I no understand that number. Reply with one of the numbers wey I list, or 0 to cancel." : "That isn't one of the options. Reply with one of the numbers I listed, or 0 to cancel."; },
  expired(lang) { return lang === "pcm" ? "Those options don expire. Tell me again wetin you need." : "Those options have expired. Tell me again what you need."; },
  cancelled(lang) { return lang === "pcm" ? "No wahala, I no buy anything." : "No problem, I haven't bought anything."; },
  failed(lang) { return lang === "pcm" ? "Sorry, e no work this time and nobody charge you. Try again small time." : "Sorry, that didn't work and you weren't charged. Please try again in a moment."; },
  // The last top-up isn't settled yet (one at a time), so nothing new starts.
  stillSettling(lang, { guardian }) { return lang === "pcm" ? `I still dey finish your last top-up. Wait small, then try again. If e pass 15 minutes, I don tell ${guardian}.` : `I'm still finishing your last top-up. Please wait a little and try again. If it takes more than 15 minutes, ${guardian} will be told.`; },
  // The payment may or may not have gone through, and the money couldn't be put back yet.
  checking(lang, { guardian }) { return lang === "pcm" ? `Sorry, something no go well. I no fit confirm am yet. I don tell ${guardian} make she check. No buy again for now.` : `Sorry, something went wrong and I can't confirm it yet. I've asked ${guardian} to check. Please don't buy this again for now.`; },
  // The provider asked us to wait (e.g. the same number was topped up a moment ago). Not charged.
  waitAMinute(lang) { return lang === "pcm" ? "Make we wait one minute before I try again. Nobody charge you." : "Let's wait one minute before I try again. You weren't charged."; },
  tryLater(lang) { return lang === "pcm" ? "The network say make we wait small. Nobody charge you. Try again after 5 minutes." : "The network asked us to wait a little. You weren't charged. Please try again in 5 minutes."; },
  refused(lang) { return lang === "pcm" ? "I no fit do that one. Nothing don pay." : "I can't do that one. Nothing was paid."; },

  // Her purse in naira first, then what her limits let her buy right now.
  balance(lang, { purseNgn, lines }) {
    const body = lines.map(({ utility, maxNgn }) => `${LABEL[lang][utility]}: up to ${naira(maxNgn)} now`).join("\n");
    return lang === "pcm"
      ? `Money for your purse: ${naira(purseNgn)}.\nThis na wetin you fit buy now:\n${body}`
      : `Your purse has ${naira(purseNgn)}.\nHere's what you can buy right now:\n${body}`;
  },

  // Her last electricity token, any time she asks. Tokens are kept with every purchase.
  lastToken(lang, { spend }) {
    if (!spend) return lang === "pcm" ? "You never buy light token yet." : "You haven't bought an electricity token yet.";
    const when = new Date(spend.at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
    return lang === "pcm"
      ? `Your last light token (${naira(spend.ngn)}, ${when}) na:\n${spend.token}${spend.units ? `\n(${spend.units})` : ""}`
      : `Your last electricity token (${naira(spend.ngn)}, ${when}) is:\n${spend.token}${spend.units ? `\n(${spend.units})` : ""}`;
  },

  // Her purchase history: newest first, with the date and time, the token for light, and this month's total.
  history(lang, { spends, monthNgn = 0 }) {
    if (!spends.length) return lang === "pcm" ? "You never buy anything yet." : "You haven't bought anything yet.";
    const when = (at) => new Date(at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const body = spends.slice(-10).reverse().map((s) => `${when(s.at)}: ${naira(s.ngn)} ${LABEL[lang][s.utility]}${s.utility === "electricity" && s.token ? ` · token ${s.token}` : ""}${s.unconfirmed ? (lang === "pcm" ? " (we never confirm am yet)" : " (not confirmed yet)") : ""}`).join("\n");
    return lang === "pcm"
      ? `Wetin you don buy last:\n${body}\nThis month: ${naira(monthNgn)}.`
      : `Your last top-ups:\n${body}\nThis month: ${naira(monthNgn)}.`;
  },

  // Purchases on one day or in one period she asked about ("yesterday", "16 Nov", "last week").
  historyFor(lang, { label, utility = null, spends, totalNgn }) {
    const multiDay = /week|month/.test(label);
    const fmt = multiDay
      ? { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }
      : { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" };
    const on = /^(today|yesterday|this|last)/.test(label) ? label : `on ${label}`;
    const what = utility ? LABEL[lang][utility] : "anything";
    if (!spends.length) return lang === "pcm" ? `You no buy ${what} ${on}.` : `You didn't buy ${what} ${on}.`;
    const body = spends.slice(-20).reverse().map((s) => `${new Date(s.at).toLocaleString("en-NG", fmt)}: ${naira(s.ngn)} ${LABEL[lang][s.utility]}${s.utility === "electricity" && s.token ? ` · token ${s.token}` : ""}${s.unconfirmed ? (lang === "pcm" ? " (we never confirm am yet)" : " (not confirmed yet)") : ""}`).join("\n");
    const count = spends.length === 1 ? (lang === "pcm" ? "1 top-up" : "1 top-up") : `${spends.length} top-ups`;
    return lang === "pcm"
      ? `Wetin you buy ${on}:\n${body}\nTotal: ${naira(totalNgn)} (${count}).`
      : `What you bought ${on}:\n${body}\nTotal: ${naira(totalNgn)} (${count}).`;
  },

  // Greeting or "What can you help me do?": who Mhasibu is, everything it does, and the menu.
  help(lang, { name, guardian }) {
    return lang === "pcm"
      ? `Mama ${name}, I be Mhasibu. ${guardian} set up CarePurse for you. See wetin I fit do:\n` +
        `• Buy light for your meter\n• Buy airtime for your phone\n• Buy data for your phone\n` +
        `• Tell you how much remain for your purse\n• Send your last light token again\n• Show wetin you don buy\n` +
        `${guardian} dey pay from your purse, within the limit wey she set. Tell me wetin you need, or reply with a number:\n${MENU.pcm}`
      : `Mama ${name}, I'm Mhasibu. ${guardian} set up CarePurse for you. Here's what I can do:\n` +
        `• Buy electricity for your meter\n• Buy airtime for your phone\n• Buy data for your phone\n` +
        `• Tell you how much is left in your purse\n• Send your last light token again\n• Show what you've bought\n` +
        `${guardian} pays from your purse, within the limits she set. Tell me what you need, or reply with a number:\n${MENU.en}`;
  },

  // When Mhasibu can't tell what Mama wants: say so, and give her a menu she answers with one digit.
  notUnderstood(lang) {
    return lang === "pcm"
      ? `Sorry Mama, I no understand. Reply with a number:\n${MENU.pcm}`
      : `Sorry Mama, I didn't understand that. Reply with a number:\n${MENU.en}`;
  },
};

// Meter and phone numbers in text for the live log: keep the last 4 digits of any run of 7 or
// more. Amounts are left alone (a run touching a decimal point, like 0.3503401 USDC, is not a number to hide).
export const maskNumbers = (text) => String(text).replace(/(?<![\d.])\d{7,}(?![\d.])/g, (n) => "•".repeat(n.length - 4) + n.slice(-4));

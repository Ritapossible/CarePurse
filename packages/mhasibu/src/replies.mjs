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
  en: "1) Light\n2) Airtime\n3) Data\n4) How much is left\n5) My last light token",
  pcm: "1) Light\n2) Airtime\n3) Data\n4) Wetin remain\n5) My last light token",
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

  capReached(lang, { utility, guardian, period }) {
    const when = period ? WHEN[lang][period] : null;
    const u = LABEL[lang][utility];
    if (lang === "pcm") return `The ${u} limit wey ${guardian} set don reach.${when ? ` E go open again ${when}.` : ""} I don tell ${guardian}.`;
    return `The ${u} limit ${guardian} set has been reached.${when ? ` It opens again ${when}.` : ""} I've let ${guardian} know.`;
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
  tryLater(lang) { return lang === "pcm" ? "The network say make we wait small. Nobody charge you. Try again after 5 minutes." : "The network asked us to wait a little. You weren't charged. Please try again in 5 minutes."; },
  refused(lang) { return lang === "pcm" ? "I no fit do that one. Nothing don pay." : "I can't do that one. Nothing was paid."; },

  balance(lang, { lines }) {
    const body = lines.map(({ utility, maxNgn }) => `${LABEL[lang][utility]}: up to ${naira(maxNgn)} now`).join("\n");
    return lang === "pcm" ? `This na wetin you fit buy now:\n${body}` : `Here's what you can buy right now:\n${body}`;
  },

  // Her last electricity token, any time she asks. Tokens are kept with every purchase.
  lastToken(lang, { spend }) {
    if (!spend) return lang === "pcm" ? "You never buy light token yet." : "You haven't bought an electricity token yet.";
    const when = new Date(spend.at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
    return lang === "pcm"
      ? `Your last light token (${naira(spend.ngn)}, ${when}) na:\n${spend.token}${spend.units ? `\n(${spend.units})` : ""}`
      : `Your last electricity token (${naira(spend.ngn)}, ${when}) is:\n${spend.token}${spend.units ? `\n(${spend.units})` : ""}`;
  },

  history(lang, { spends }) {
    if (!spends.length) return lang === "pcm" ? "You never buy anything yet." : "You haven't bought anything yet.";
    const body = spends.slice(-5).reverse().map((s) => `${new Date(s.at).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" })}: ${naira(s.ngn)} ${LABEL[lang][s.utility]}${s.token ? ` · token ${s.token}` : ""}${s.unconfirmed ? (lang === "pcm" ? " (we never confirm am yet)" : " (not confirmed yet)") : ""}`).join("\n");
    return lang === "pcm" ? `Wetin you don buy last:\n${body}` : `Your last top-ups:\n${body}`;
  },

  help(lang, { name, guardian }) {
    return lang === "pcm"
      ? `Mama ${name}, I be Mhasibu. ${guardian} set up CarePurse for you. Tell me when your light, airtime or data dey low, or reply with a number:\n${MENU.pcm}`
      : `Mama ${name}, I'm Mhasibu. ${guardian} set up CarePurse for you. Tell me when your light, airtime or data is low, or reply with a number:\n${MENU.en}`;
  },

  // When Mhasibu can't tell what Mama wants: say so, and give her a menu she answers with one digit.
  notUnderstood(lang) {
    return lang === "pcm"
      ? `Sorry Mama, I no understand. Reply with a number:\n${MENU.pcm}`
      : `Sorry Mama, I didn't understand that. Reply with a number:\n${MENU.en}`;
  },
};

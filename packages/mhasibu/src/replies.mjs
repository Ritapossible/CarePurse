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
  refused(lang) { return lang === "pcm" ? "I no fit do that one. Nothing don pay." : "I can't do that one. Nothing was paid."; },

  balance(lang, { lines }) {
    const body = lines.map(({ utility, maxNgn }) => `${LABEL[lang][utility]}: up to ${naira(maxNgn)} now`).join("\n");
    return lang === "pcm" ? `This na wetin you fit buy now:\n${body}` : `Here's what you can buy right now:\n${body}`;
  },

  history(lang, { spends }) {
    if (!spends.length) return lang === "pcm" ? "You never buy anything yet." : "You haven't bought anything yet.";
    const body = spends.slice(-5).reverse().map((s) => `${new Date(s.at).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" })}: ${naira(s.ngn)} ${LABEL[lang][s.utility]}`).join("\n");
    return lang === "pcm" ? `Wetin you don buy last:\n${body}` : `Your last top-ups:\n${body}`;
  },

  help(lang, { name, guardian }) {
    return lang === "pcm"
      ? `Mama ${name}, I be Mhasibu. ${guardian} set up CarePurse for you. Tell me when your light, airtime or data dey low.`
      : `Mama ${name}, I'm Mhasibu. ${guardian} set up CarePurse for you. Tell me when your light, airtime or data is low.`;
  },
};

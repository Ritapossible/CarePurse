// Which language Mama wrote in: Nigerian Pidgin ("pcm") or English ("en"), from her own words.
// Nobody picks it at sign-up. Each message that gives a clear sign switches Mhasibu's replies;
// a message with no sign either way ("1", "500", "light") keeps the language she used last.
// Words both use ("buy", "my", "light") count for neither.

const PIDGIN = new Set([
  "abeg", "wetin", "dey", "don", "una", "abi", "sef", "wahala", "pikin", "sabi", "comot", "shey",
  "wey", "dem", "na", "nau", "jare", "biko", "oya", "nawa", "ehn", "chai", "remain",
  "dis", "dat", "mek", "wan", "sha", "ooo", "o",
]);
const PIDGIN_PHRASES = [/\bmake i\b/, /\bno be\b/, /\bhow far\b/, /\bi wan\b/, /\bmake una\b/];

const ENGLISH = new Set([
  "please", "what", "is", "are", "the", "would", "could", "should", "have", "has", "thank", "thanks",
  "remaining", "left", "doesn't", "don't", "hello", "kindly", "need", "it's", "i'm", "finished",
  "am",
]);

export function detectLanguage(text) {
  const t = String(text ?? "").toLowerCase();
  const words = t.match(/[a-z']+/g) ?? [];
  let pcm = PIDGIN_PHRASES.filter((re) => re.test(t)).length;
  let en = 0;
  for (const w of words) {
    if (PIDGIN.has(w)) pcm++;
    else if (ENGLISH.has(w)) en++;
  }
  if (pcm > en) return "pcm";
  if (en > pcm) return "en";
  return null; // no clear sign: keep the language she used last
}

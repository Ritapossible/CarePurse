// Which day or period Mama is asking about, read from her words, in Lagos time:
// "today", "yesterday", "on Monday", "16 Nov", "November 16th", "16/11", "this week", "last month".
// Plain code, not the model: a date decides which purchases she sees, so it must be exact.
// Returns { from, to, label } (UTC ms, `to` exclusive) or null when she named no day.

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Nigeria is UTC+1 all year
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Lagos calendar date (y, m 0-11, d) → UTC ms of its midnight in Lagos.
const midnight = (y, m, d) => Date.UTC(y, m, d) - LAGOS_OFFSET_MS;
const lagosDate = (ms) => { const t = new Date(ms + LAGOS_OFFSET_MS); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), wd: t.getUTCDay() }; };
const dayLabel = (from) => new Date(from + LAGOS_OFFSET_MS).toLocaleDateString("en-NG", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const oneDay = (from, label) => ({ from, to: from + DAY_MS, label: label ?? dayLabel(from) });

// A day and month with no year means the latest one that isn't in the future.
function pastDate(now, m, d) {
  const today = lagosDate(now);
  let y = today.y;
  if (midnight(y, m, d) > midnight(today.y, today.m, today.d)) y -= 1;
  const check = lagosDate(midnight(y, m, d));
  if (check.m !== m || check.d !== d) return null; // 31 Feb and the like
  return midnight(y, m, d);
}

export function parseDay(text, now = Date.now()) {
  const t = ` ${String(text ?? "").toLowerCase().replace(/[,.?!]/g, " ")} `;
  const today = lagosDate(now);
  const start = midnight(today.y, today.m, today.d);

  if (/\b(day before yesterday|day wey pass yesterday)\b/.test(t)) return oneDay(start - 2 * DAY_MS);
  if (/\b(yesterday|yestaday|yesterdy)\b/.test(t)) return oneDay(start - DAY_MS, "yesterday");
  if (/\b(today|todey|this morning|this afternoon|this evening|tonight)\b/.test(t)) return oneDay(start, "today");

  const weekStart = start - ((today.wd + 6) % 7) * DAY_MS; // Monday
  if (/\b(last|past) week\b/.test(t)) return { from: weekStart - 7 * DAY_MS, to: weekStart, label: "last week" };
  if (/\bthis week\b/.test(t)) return { from: weekStart, to: start + DAY_MS, label: "this week" };
  const monthStart = midnight(today.y, today.m, 1);
  if (/\b(last|past) month\b/.test(t)) return { from: midnight(today.y, today.m - 1, 1), to: monthStart, label: "last month" };
  if (/\bthis month\b/.test(t)) return { from: monthStart, to: start + DAY_MS, label: "this month" };

  // 16 Nov, 16th of November, 16 November 2026
  let m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}(?:\\s+(\\d{4}))?\\b`));
  if (m) return explicit(now, Number(m[1]), MONTHS.indexOf(m[2].slice(0, 3)), m[3]);
  // Nov 16, November 16th
  m = t.match(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`));
  if (m) return explicit(now, Number(m[2]), MONTHS.indexOf(m[1].slice(0, 3)), m[3]);
  // 16/11 or 16-11-2026 (day first, as written in Nigeria). Not phone or meter numbers: 1-2 digits each.
  m = t.match(/(?<![\d/-])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?(?![\d/-])/);
  if (m) return explicit(now, Number(m[1]), Number(m[2]) - 1, m[3] && (m[3].length === 2 ? `20${m[3]}` : m[3]));

  // A weekday: the latest one, today included ("on Monday" on a Monday means today).
  const wd = DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (wd >= 0) {
    const back = (today.wd - wd + 7) % 7;
    return oneDay(start - back * DAY_MS, back === 0 ? "today" : undefined);
  }
  return null;
}

function explicit(now, d, m, year) {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const from = year ? midnight(Number(year), m, d) : pastDate(now, m, d);
  if (from === null || lagosDate(from).d !== d) return null;
  return oneDay(from);
}

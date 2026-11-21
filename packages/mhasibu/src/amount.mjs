// A naira amount in Mama's words: "#2000", "₦2,000", "N2000", "2000 naira", "2k", or a plain number
// next to light, airtime or data ("buy airtime 2000"). Read by code, never by the model: an amount
// decides what is bought. Menu digits ("1", "3") and meter or phone numbers are never amounts.
const MARKED = /(?:₦|#|\bngn\s*|\bn(?=\d))\s*(\d{1,3}(?:,\d{3})+|\d{2,7})(?:\.\d{1,2})?\b|\b(\d{1,3}(?:,\d{3})+|\d{2,7})\s*(?:naira|ngn)\b|\b(\d{1,3}(?:\.\d)?)\s*k\b/i;
const PLAIN = /(?<![\d,])(\d{1,3}(?:,\d{3})+|\d{2,6})(?![\d,])/;
const toNumber = (s) => Number(String(s).replace(/,/g, ""));

export function parseAmount(text, { utilityNamed = false } = {}) {
  const t = String(text ?? "");
  if (/^\s*\d{1,2}\s*[.!]*\s*$/.test(t)) return null; // a menu choice
  const m = t.match(MARKED);
  let ngn = null;
  if (m) ngn = m[3] !== undefined ? Math.round(toNumber(m[3]) * 1000) : toNumber(m[1] ?? m[2]);
  else if (utilityNamed) {
    const p = t.match(PLAIN);
    if (p) ngn = toNumber(p[1]);
  }
  if (!Number.isFinite(ngn) || ngn < 50 || ngn > 1_000_000) return null;
  return ngn;
}

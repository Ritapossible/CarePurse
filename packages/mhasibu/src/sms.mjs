// Text messages to Mama through Termii (Nigeria): her sign-in code and her electricity token.
// Configured with TERMII_API_KEY (and optionally TERMII_SENDER_ID, TERMII_BASE_URL, TERMII_CHANNEL). Without a key,
// `configured` is false and nothing is sent.
//   POST {base}/api/sms/send  { to: "234…", from, sms, type: "plain", channel, api_key }
// channel "dnd" reaches Nigerian lines with Do-Not-Disturb on (needed for sign-in codes).
export function createSms({ apiKey = "", senderId = "CarePurse", baseUrl = "https://v3.api.termii.com", channel = "dnd", fetchImpl = fetch, log = console } = {}) {
  const configured = Boolean(apiKey);
  // 0803… → 234803…
  const intl = (phone) => String(phone).replace(/\D/g, "").replace(/^0/, "234");
  return {
    configured,
    async send(phone, text) {
      if (!configured) throw new Error("SMS is not set up (TERMII_API_KEY)");
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/api/sms/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: intl(phone), from: senderId, sms: text, type: "plain", channel, api_key: apiKey }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || (body.code && body.code !== "ok")) {
        // Never log the key or the message body (it can hold a code or a token).
        log.warn?.(`SMS to •••${String(phone).slice(-4)} failed (HTTP ${res.status}${body.message ? `: ${String(body.message).slice(0, 80)}` : ""})`);
        throw new Error("The text message could not be sent. Please try again.");
      }
      return { id: body.message_id ?? null };
    },
  };
}

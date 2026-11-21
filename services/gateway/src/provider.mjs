// The utility provider: who actually issues the electricity token or the airtime/data top-up.
// For the hackathon this is a SANDBOX: it returns demo tokens and never touches a real meter
// or phone. A real biller (VTpass sandbox, then a live aggregator) plugs in behind the same two functions.
import crypto from "node:crypto";

const digits = (n) => Array.from(crypto.randomBytes(n), (b) => b % 10).join("");
const groups = (s) => s.match(/.{1,4}/g).join(" ");

export function createMockProvider() {
  return {
    name: "mock sandbox",

    // Who owns this meter? Lets the daughter confirm it's Mama's before saving it.
    async lookupMeter(meter) {
      if (!/^\d{11,13}$/.test(meter)) return { ok: false, reason: "A meter number has 11 to 13 digits." };
      return { ok: true, meter, ownerName: "SANDBOX CUSTOMER", disco: "IKEDC prepaid (sandbox)" };
    },

    async purchase({ utility, ngn, destination }) {
      if (utility === "electricity") {
        return { ok: true, token: groups(digits(20)), units: `${(ngn / 225).toFixed(1)} kWh (demo)`, reference: `SBX-${digits(10)}` };
      }
      return { ok: true, reference: `SBX-${digits(10)}`, note: `₦${ngn} ${utility} sent to ${destination} (sandbox)` };
    },
  };
}

// ── VTpass sandbox ───────────────────────────────────────────
// Real bills-payment API, sandbox mode: real requests and responses, no real meter or phone is
// topped up. Docs: https://vtpass.com/documentation/ (authentication, request IDs, IKEDC, MTN).
//   GET  needs headers api-key + public-key;  POST needs api-key + secret-key.
//   Sandbox test numbers: meter 1111111111111 (prepaid, succeeds), phone 08011111111 (succeeds).
//   Any other number fails in the sandbox, by design.

export const NETWORKS = ["mtn", "glo", "airtel", "etisalat"]; // etisalat = 9mobile
export const DISCOS = [
  "ikeja-electric", "eko-electric", "abuja-electric", "kano-electric", "portharcourt-electric",
  "jos-electric", "ibadan-electric", "kaduna-electric", "enugu-electric", "benin-electric", "aba-electric", "yola-electric",
];

// request_id: Lagos time YYYYMMDDHHII, then any alphanumeric suffix (VTpass rule).
export function vtpassRequestId(now = Date.now()) {
  const lagos = new Date(now + 60 * 60 * 1000).toISOString(); // UTC+1, no daylight saving
  const stamp = lagos.slice(0, 16).replace(/[-T:]/g, "");
  return `${stamp}${crypto.randomBytes(6).toString("hex")}`;
}

// VTpass's own answer, for logs: its code and message, never our keys.
const vtpassSays = (json) => ({ code: json?.code ?? null, message: json?.response_description ?? json?.message ?? json?.content?.error ?? null });

const cleanToken = (t) => String(t ?? "").replace(/^\s*token\s*:\s*/i, "").trim();

export function createVtpassProvider({ baseUrl, apiKey, secretKey, publicKey, contactPhone, fetchImpl = fetch, clock = Date.now, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!apiKey || !secretKey || !publicKey) throw new Error("UTILITY_PROVIDER=vtpass needs VTPASS_API_KEY, VTPASS_SECRET_KEY and VTPASS_PUBLIC_KEY (sandbox keys).");
  // The shape of each key, never its value: shown only when VTpass rejects the credentials, so a
  // swapped, quoted or truncated key can be spotted without anyone reading the key.
  const shape = (k, prefix) => ({ length: k.length, ...(prefix ? { [`startsWith${prefix}`]: k.startsWith(prefix) } : {}), quoted: /^["'].*["']$/.test(k) });
  const keyShapes = { apiKey: shape(apiKey), publicKey: shape(publicKey, "PK_"), secretKey: shape(secretKey, "SK_") };
  const base = baseUrl.replace(/\/$/, "");

  async function call(method, path, body) {
    const headers = method === "GET" ? { "api-key": apiKey, "public-key": publicKey } : { "api-key": apiKey, "secret-key": secretKey, "content-type": "application/json" };
    const res = await fetchImpl(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45_000) });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  // A VTpass purchase reply: delivered, pending, or failed.
  function outcome(json) {
    const status = json?.content?.transactions?.status;
    if (json?.code === "000" && status === "delivered") return "delivered";
    if (["099", "001"].includes(json?.code) || ["pending", "initiated"].includes(status)) return "pending";
    return "failed";
  }

  async function pay(body) {
    const request_id = vtpassRequestId(clock());
    let { json } = await call("POST", "/pay", { request_id, ...body });
    // Pending: ask again a few times before giving up (the gateway then refuses, and x402 doesn't settle).
    for (let i = 0; i < 3 && outcome(json) === "pending"; i++) {
      await wait(3_000);
      ({ json } = await call("POST", "/requery", { request_id }));
    }
    return { request_id, json, result: outcome(json) };
  }

  const bundleCache = new Map();
  async function dataBundles(network) {
    const hit = bundleCache.get(network);
    if (hit && clock() - hit.at < 10 * 60_000) return hit.list;
    const { json } = await call("GET", `/service-variations?serviceID=${network}-data`);
    const list = (json?.content?.variations ?? json?.content?.varations ?? [])
      .map((v) => ({ code: v.variation_code, name: v.name, amount: Number(v.variation_amount) }))
      // Internet data only: the list also holds talk-time bundles ("Xtratalk") and others.
      .filter((v) => /\d+(\.\d+)?\s?(MB|GB)\b/i.test(v.name) && !/talk|voice|sms|minutes?/i.test(v.name))
      .filter((v) => v.amount > 0);
    bundleCache.set(network, { at: clock(), list });
    return list;
  }

  // The bundle that costs exactly this tier. Never a cheaper one: Mama pays the tier price, so
  // she must get a bundle of that price (first match in VTpass's list).
  async function dataVariation(network, ngn) {
    return (await dataBundles(network)).find((v) => v.amount === ngn) ?? null;
  }

  return {
    name: "VTpass sandbox",

    // Data tiers this network really sells at exactly that price (others are hidden).
    async dataTiers(network = "mtn") {
      return new Set((await dataBundles(network)).map((v) => v.amount));
    },

    // The sandbox wallet's balance (VTpass debits it for every purchase).
    async balance() {
      const { json } = await call("GET", "/balance");
      return { ok: json?.code === 1 || json?.code === "000" || json?.contents?.balance !== undefined, balance: json?.contents?.balance ?? json?.content?.balance ?? null, vtpass: vtpassSays(json) };
    },

    async lookupMeter(meter, { disco = "ikeja-electric" } = {}) {
      if (!/^\d{11,13}$/.test(meter)) return { ok: false, reason: "A meter number has 11 to 13 digits." };
      if (!DISCOS.includes(disco)) return { ok: false, reason: "Unknown electricity company." };
      const { json } = await call("POST", "/merchant-verify", { billersCode: meter, serviceID: disco, type: "prepaid" });
      const c = json?.content ?? {};
      // VTpass answered "000" but the meter is wrong: that is the meter. Any other code (087 bad
      // credentials, 010/0xx service errors, no answer) is our problem, not the daughter's number.
      if (json?.code === "000" && (c.WrongBillersCode || c.error)) return { ok: false, reason: c.error ?? "The electricity company did not recognise this meter.", vtpass: vtpassSays(json) };
      if (json?.code !== "000") return { ok: false, unavailable: true, reason: "We couldn’t reach the electricity company to check this meter. Please try again in a minute.", vtpass: { ...vtpassSays(json), ...(json?.code === "087" ? { keys: keyShapes } : {}) } };
      return { ok: true, meter, ownerName: c.Customer_Name, address: c.Address, disco, canVend: c.Can_Vend ?? null };
    },

    async purchase({ utility, ngn, destination, network = "mtn", disco = "ikeja-electric", contactPhone: phone }) {
      if (utility === "electricity") {
        const r = await pay({ serviceID: disco, billersCode: destination, variation_code: "prepaid", amount: ngn, phone: phone ?? contactPhone });
        if (r.result !== "delivered") return { ok: false, reason: r.json?.response_description ?? r.result, reference: r.request_id, vtpass: vtpassSays(r.json), retryLater: r.json?.code === "019" || r.result === "pending" };
        const token = cleanToken(r.json.token ?? r.json.purchased_code ?? r.json.mainToken ?? r.json.content?.transactions?.token);
        return { ok: true, token: token.replace(/\D/g, "").match(/.{1,4}/g)?.join(" ") ?? token, units: r.json.units ?? r.json.mainTokenUnits ?? null, reference: r.request_id, provider: "VTpass sandbox" };
      }
      if (utility === "airtime") {
        const r = await pay({ serviceID: network, amount: ngn, phone: destination });
        if (r.result !== "delivered") return { ok: false, reason: r.json?.response_description ?? r.result, reference: r.request_id, vtpass: vtpassSays(r.json), retryLater: r.json?.code === "019" || r.result === "pending" };
        return { ok: true, reference: r.request_id, note: `₦${ngn} ${network.toUpperCase()} airtime sent to ${destination}`, provider: "VTpass sandbox" };
      }
      const bundle = await dataVariation(network, ngn);
      if (!bundle) return { ok: false, reason: `No ${network} data bundle costs exactly ₦${ngn}.` };
      const r = await pay({ serviceID: `${network}-data`, billersCode: destination, variation_code: bundle.code, amount: bundle.amount, phone: destination });
      if (r.result !== "delivered") return { ok: false, reason: r.json?.response_description ?? r.result, reference: r.request_id, vtpass: vtpassSays(r.json), retryLater: r.json?.code === "019" || r.result === "pending" };
      return { ok: true, reference: r.request_id, bundle: bundle.name, note: `${bundle.name} sent to ${destination}`, provider: "VTpass sandbox" };
    },
  };
}

export function createProvider(name, options = {}) {
  if (name === "mock") return createMockProvider();
  if (name === "vtpass") return createVtpassProvider(options);
  throw new Error(`UTILITY_PROVIDER=${name} is not supported. Use mock or vtpass.`);
}

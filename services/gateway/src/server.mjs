// The CarePurse gateway: the x402 seller.
//
//   GET  /v1/options?utility=electricity[&max_ngn=5000]   free: sizes and prices
//   GET  /v1/meters/:meter                                free: who owns this meter
//   POST /v1/orders {utility, ngn, destination}           free: create an order
//   GET  /v1/orders/:id                                   free: order status
//   GET  /paid/topup/:utility/:ngn?order=<id>             x402: 402 until paid, then the token
//
// The flow on the paid route: 402 → the payer signs a USDC transfer → retry → the facilitator
// verifies → our handler fulfils → the facilitator settles on Stellar → 200 with PAYMENT-RESPONSE.
// If the handler answers with an error, the middleware cancels settlement and nobody pays.
import { pathToFileURL } from "node:url";
import express from "express";
import { StrKey } from "@stellar/stellar-sdk";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { config as defaultConfig, explorer } from "./config.mjs";
import { UTILITIES, isTier, isUtility, options, paidRoutes, priceBaseUnits } from "./catalog.mjs";
import { createStore, isExpired } from "./store.mjs";
import { createProvider, NETWORKS, DISCOS } from "./provider.mjs";

const LABEL = "Live Stellar Testnet payment · sandbox utility fulfilment";
const PHONE = /^0[789][01]\d{8}$/; // Nigerian mobile: 080…, 081…, 090…, 070…, 091…
const METER = /^\d{11,13}$/;

export function facilitatorClientFor(fac) {
  return new HTTPFacilitatorClient({
    url: fac.url,
    ...(fac.apiKey && {
      createAuthHeaders: async () => {
        const h = { Authorization: `Bearer ${fac.apiKey}` };
        return { verify: h, settle: h, supported: h };
      },
    }),
  });
}

export function createApp({
  config = defaultConfig,
  store = createStore(config.ordersFile),
  provider = createProvider(config.provider, config.vtpass),
  facilitatorClient = facilitatorClientFor(config.facilitator),
  log = console,
} = {}) {
  const app = express();
  app.use(express.json());
  const priceOf = (utility, ngn) => priceBaseUnits(ngn, config.ngnPerUsdc, config.usdc.decimals);

  app.get("/health", (_req, res) => res.json({ ok: true, network: config.network, label: LABEL }));

  app.get("/v1/options", (req, res) => {
    const { utility } = req.query;
    if (!isUtility(utility)) return res.status(400).json({ error: `utility must be one of: ${Object.keys(UTILITIES).join(", ")}` });
    const maxNgn = req.query.max_ngn === undefined ? undefined : Number(req.query.max_ngn);
    if (maxNgn !== undefined && !(maxNgn > 0)) return res.status(400).json({ error: "max_ngn must be a positive number" });
    res.json({ utility, options: options(utility, { ngnPerUsdc: config.ngnPerUsdc, decimals: config.usdc.decimals, maxNgn }) });
  });

  app.get("/v1/meters/:meter", async (req, res) => {
    const result = await provider.lookupMeter(req.params.meter, { disco: req.query.disco });
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/v1/orders", (req, res) => {
    const { utility, destination } = req.body ?? {};
    const ngn = Number(req.body?.ngn);
    if (!isUtility(utility)) return res.status(400).json({ error: "Unknown utility." });
    if (!isTier(utility, ngn)) return res.status(400).json({ error: `₦${ngn} is not a size we sell for ${utility}.` });
    const pattern = UTILITIES[utility].destination === "meter" ? METER : PHONE;
    if (typeof destination !== "string" || !pattern.test(destination)) {
      return res.status(400).json({ error: `destination must be a ${UTILITIES[utility].destination === "meter" ? "meter number" : "Nigerian phone number"}.` });
    }
    // Who delivers it: the mobile network (airtime, data) or the electricity company (meter).
    const network = req.body?.network ?? "mtn";
    const disco = req.body?.disco ?? "ikeja-electric";
    if (utility !== "electricity" && !NETWORKS.includes(network)) return res.status(400).json({ error: `network must be one of: ${NETWORKS.join(", ")}` });
    if (utility === "electricity" && !DISCOS.includes(disco)) return res.status(400).json({ error: "Unknown electricity company." });
    // Electricity: VTpass also wants a phone for the receipt; Mhasibu sends Mama's.
    const contactPhone = req.body?.contactPhone;
    if (contactPhone !== undefined && (typeof contactPhone !== "string" || !PHONE.test(contactPhone))) return res.status(400).json({ error: "contactPhone must be a Nigerian phone number." });
    const extra = utility === "electricity" ? { disco, ...(contactPhone ? { contactPhone } : {}) } : { network };
    const order = store.create({ utility, ngn, destination, amount: priceOf(utility, ngn), ttlMinutes: config.orderTtlMinutes, ...extra });
    res.status(201).json({ order, payPath: `/paid/topup/${utility}/${ngn}?order=${order.id}` });
  });

  app.get("/v1/orders/:id", (req, res) => {
    const order = store.get(req.params.id);
    if (!order) return res.status(404).json({ error: "No such order." });
    res.json({ order, ...(order.txHash && { transaction: explorer.tx(order.txHash) }) });
  });

  // ── Paid routes ─────────────────────────────────────────────
  // Fail closed: without a valid recipient, nothing is sold, and nothing is ever free.
  if (!StrKey.isValidEd25519PublicKey(config.recipient)) {
    log.warn("⚠ GATEWAY_RECIPIENT missing or invalid: paid routes return 503. Run: npm run setup");
    app.use("/paid", (_req, res) => res.status(503).json({ error: "Payments are not configured on this gateway." }));
    return app;
  }

  // Check the order BEFORE asking for money, so nobody is asked to pay for a bad order.
  app.use("/paid/topup/:utility/:ngn", (req, res, next) => {
    const { utility } = req.params;
    const ngn = Number(req.params.ngn);
    if (!isTier(utility, ngn)) return res.status(404).json({ error: "No such top-up." });
    const order = store.get(String(req.query.order ?? ""));
    if (!order) return res.status(400).json({ error: "Create an order first: POST /v1/orders." });
    if (order.utility !== utility || order.ngn !== ngn) return res.status(400).json({ error: "This order is for a different top-up." });
    if (order.status !== "created") return res.status(409).json({ error: `This order is already ${order.status}.` });
    if (isExpired(order)) return res.status(410).json({ error: "This order has expired. Create a new one." });
    req.order = order;
    next();
  });

  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register(config.network, new ExactStellarScheme())
    .onVerifyFailure(async ({ error }) => log.warn(`  ✗ verify failed: ${error?.message ?? error}`))
    .onSettleFailure(async ({ error }) => log.warn(`  ✗ settle failed: ${error?.message ?? error}`));

  const routes = paidRoutes({
    ngnPerUsdc: config.ngnPerUsdc,
    decimals: config.usdc.decimals,
    asset: config.usdc.contractId,
    network: config.network,
    payTo: config.recipient,
  });
  app.use("/paid", paymentMiddleware(routes, resourceServer));

  // Only reached with a verified payment. Settlement happens after this answers 200.
  app.get("/paid/topup/:utility/:ngn", async (req, res) => {
    const order = store.transition(req.order.id, "created", "fulfilling");
    if (!order) return res.status(409).json({ error: "This order is already being processed." });

    // Record the outcome once the response (and settlement) is finished.
    res.on("finish", () => {
      const header = res.getHeader("payment-response");
      let settlement = null;
      try { settlement = header ? decodePaymentResponseHeader(String(header)) : null; } catch { /* unreadable */ }
      if (res.statusCode === 200 && settlement?.success && store.claimTransaction(settlement.transaction, order.id)) {
        store.transition(order.id, "fulfilling", "delivered", { txHash: settlement.transaction, payer: settlement.payer });
        log.info(`  ✓ ${order.utility} ₦${order.ngn} delivered · ${explorer.tx(settlement.transaction)}`);
      } else {
        store.transition(order.id, "fulfilling", "failed", { reason: `HTTP ${res.statusCode}, settlement ${settlement?.success ? "reused" : "failed"}` });
        log.warn(`  ✗ order ${order.id} failed (HTTP ${res.statusCode})`);
      }
    });

    try {
      const result = await provider.purchase(order);
      if (!result.ok) log.error(`provider refused order ${order.id}: ${result.reason ?? "no reason"}`);
      if (!result.ok) return res.status(502).json({ error: "The utility provider refused this top-up. You were not charged." });
      res.json({ order: order.id, utility: order.utility, ngn: order.ngn, destination: order.destination, ...result, fulfilment: "sandbox", label: LABEL });
    } catch (err) {
      log.error(err);
      res.status(502).json({ error: "The utility provider is unavailable. You were not charged." });
    }
  });

  return app;
}

// Run directly: npm start
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createApp();
  app.listen(defaultConfig.port, () => {
    console.log(`CarePurse gateway on ${defaultConfig.gatewayUrl}`);
    console.log(`Facilitator: ${defaultConfig.facilitator.name} · ${LABEL}`);
  });
}

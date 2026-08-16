/**
 * Feature flags (docs/18, docs/20). Roll-out: deploy disabled -> internal test
 * -> cohort -> general release. Defaults follow the safe product defaults in
 * docs/20 (timed auctions + EOI + Cube on; higher-risk modes off).
 */
export interface FeatureFlags {
  timedAuctions: boolean;
  eoi: boolean;
  buyNow: boolean;
  makeOffer: boolean;
  sealedTender: boolean;
  liveAuctions: boolean;
  cubeCatalogue: boolean;
  aiListing: boolean;
  aiMediaEnhance: boolean;
  // Customer-facing AI conversation assistant (AIC-1). Default OFF; ENFORCED server-side
  // (unlike aiListing/aiMediaEnhance above) — gates POST /assistant/message and
  // GET /assistant/conversations/:id. Non-binding: the assistant answers/suggests only,
  // never places a bid/offer/EOI (rule 11).
  aiConversation: boolean;
  socialAutoPublish: boolean;
  whatsappBidIntent: boolean;

  // V3 experience flags (docs pack 21). Default OFF; server/config-controlled so
  // the V3 rebuild ships dark and rolls out (internal -> cohort -> general) or
  // rolls back without a redeploy. Presentation gating only — never an auth/credit
  // authority.
  v3VisualArchitecture: boolean;
  flowMatrixV3: boolean;
  categoryOverlayV3: boolean;
  featuredReelV3: boolean;
  discoverV3: boolean;
  buyerTwinV3: boolean;
  bidBattleV3: boolean;
  gestureBidV3: boolean;
  engagementV3: boolean;
  dashboardV3Beta: boolean;
  liveV3: boolean;

  // Singha Evolution config foundations (E2). Default OFF; these gate the new
  // config-domain surfaces (Operator/Market/Node, structured Location, quantity
  // units, configurable sale-method taxonomy) until each is fully wired.
  multiOperator: boolean;
  structuredLocations: boolean;
  quantityUnits: boolean;
  saleMethodConfig: boolean;

  // Singha Evolution Commercial Offer Engine V2 (E4). Default OFF; gate the new
  // negotiation surface — full-terms proposals + immutable revisions
  // (commercialOffersV2) and the confidential sealed-offer flow with a
  // controlled reveal + explicit award (sealedOffers). Binding selection is
  // MANUAL_SELECTION by default — the highest sealed proposal never auto-awards
  // (DECISIONS D4).
  commercialOffersV2: boolean;
  sealedOffers: boolean;

  // Singha Evolution Currency / FX (E5). Default OFF; gate the multi-currency
  // surface (supported-currency list) and the informational display-currency
  // conversion (`fxDisplay`). Display conversion never mutates the binding
  // transaction currency (DECISIONS D5); the FX source is swappable (Google, D12).
  multiCurrency: boolean;
  fxDisplay: boolean;

  // Singha Evolution Transaction Routing + two-layer Terms (E6). Default OFF; gates
  // the deterministic routing engine (operator/payment-route/terms/verification
  // resolution, or MANUAL_REVIEW_REQUIRED) and the terms resolution surface. Binding
  // routes depend on owner-verified config (DECISIONS D7).
  transactionRouting: boolean;

  // Singha Evolution Logistics / Ports / Incoterms (E7). Default OFF. `logistics`
  // gates the logistics surface + deterministic instant estimates (fake provider);
  // `logisticsQuotes` additionally gates live provider quotes (owner register O6).
  logistics: boolean;
  logisticsQuotes: boolean;

  // Singha Evolution Fees / Tax / Rules engine (E8). Default OFF; gates the
  // versioned, deterministic charge-breakdown engine. Tax rule values are
  // owner-gated (O3) — an unverified rule yields a non-binding preview (D7).
  feesEngine: boolean;

  // Singha Evolution Payment orchestration (E8b). Default OFF; gates the regulated
  // payment-route resolver + signed/idempotent webhook intake. Routes reference
  // EXTERNAL regulated providers only (no internal banking/escrow); a route that is
  // not owner-verified/licensed yields MANUAL_REVIEW_REQUIRED (owner O4).
  operatorPayments: boolean;

  // Singha Evolution Procurement / two-sided market (E9). Default OFF; gates
  // buyer-initiated RFQ / Request-Supply / reverse-tender requests + supplier
  // proposals. A procurement award is buyer-explicit and never auto-awarded.
  procurement: boolean;

  // Singha Evolution Supply Programmes + perishable goods (E10). Default OFF.
  // `supplyProgrammes` gates the recurring-availability surface + buyer-side
  // matching (a recommendation only, never an auto-award — D4); `perishableGoods`
  // gates the agricultural/food specialist metadata + automatic-expiry predicate.
  supplyProgrammes: boolean;
  perishableGoods: boolean;

  // Singha Evolution Singha ID (E11). Default OFF; gates the geography-neutral member profile +
  // capability-based verification surface. A gated activity requires a verified, unexpired capability
  // grant; the evidence bar per activity/market is owner-gated (register O7).
  singhaId: boolean;

  // Singha Evolution unified Dashboard + Control Centre (E11b). Default OFF. `dashboard` gates the
  // member's cross-domain command centre (Buying/Selling/Verification projection); `controlCentre`
  // gates the operator-scoped admin overview (config + record counts + attention alerts). Both are
  // read-only projections and never own authoritative data.
  dashboard: boolean;
  controlCentre: boolean;

  // Singha Evolution Intelligence expansion (E12). Default OFF; gates the deterministic
  // intelligence surface — matching, offer/pricing comparison and risk signals. Every output is a
  // derived, non-binding recommendation (no LLM binds; deterministic code owns money/eligibility).
  insightEngine: boolean;

  // Singha Evolution Satellite Market Node + SEO (E13, Addendum A). Default OFF; gates the node
  // presentation/origination surface + the deterministic SEO helpers. A node never owns binding
  // records — origination is attribution over the one central authoritative domain.
  satelliteNodes: boolean;
}

export type FeatureFlagName = keyof FeatureFlags;

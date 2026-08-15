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
}

export type FeatureFlagName = keyof FeatureFlags;

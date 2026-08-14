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
}

export type FeatureFlagName = keyof FeatureFlags;

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
}

export type FeatureFlagName = keyof FeatureFlags;

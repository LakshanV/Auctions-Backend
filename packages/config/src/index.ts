import { type BusinessConfig, BUSINESS_APPROVAL_REQUIRED } from './business-config';
import { type FeatureFlags } from './feature-flags';
import { parseEnv, type RawEnv } from './env';

export * from './env';
export * from './feature-flags';
export * from './business-config';

export interface ProviderStatus {
  configured: boolean;
}

export interface ProviderConfig {
  storage: ProviderStatus;
  aiText: ProviderStatus;
  aiVision: ProviderStatus;
  messagingMeta: ProviderStatus;
  whatsapp: ProviderStatus;
  sms: ProviderStatus;
  email: ProviderStatus;
  live: ProviderStatus;
  youtube: ProviderStatus;
  payment: ProviderStatus;
}

/** Fully-resolved, typed application configuration used by server processes. */
export interface SupabaseConfig {
  url: string;
  /** Server-only key (secret/service_role). Never exposed to the browser. */
  serviceKey: string;
  anonKey: string;
  publishableKey: string;
  storageBucket: string;
  configured: boolean;
}

export interface AppConfig {
  nodeEnv: RawEnv['NODE_ENV'];
  isProduction: boolean;
  isTest: boolean;
  logLevel: RawEnv['LOG_LEVEL'];
  http: {
    apiPort: number;
    webPort: number;
    workerMetricsPort: number;
    siteUrl: string;
    apiUrl: string;
    corsOrigins: string[];
  };
  demo: { authEnabled: boolean };
  db: { url: string; directUrl: string };
  redis: { url: string; enabled: boolean };
  security: { jwtSecret: string; sessionSecret: string };
  locale: { defaultCurrency: string; defaultLocale: string };
  business: BusinessConfig;
  features: FeatureFlags;
  providers: ProviderConfig;
  supabase: SupabaseConfig;
}

const configured = (value: string): ProviderStatus => ({ configured: value.trim().length > 0 });

/** Build a typed AppConfig from an environment record (pure; no side effects). */
export function loadConfig(source?: NodeJS.ProcessEnv | Record<string, unknown>): AppConfig {
  const env = parseEnv(source);
  const supabaseServerKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseConfigured =
    env.SUPABASE_URL.trim().length > 0 && supabaseServerKey.trim().length > 0;
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    logLevel: env.LOG_LEVEL,
    http: {
      apiPort: env.API_PORT,
      webPort: env.WEB_PORT,
      workerMetricsPort: env.WORKER_METRICS_PORT,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
      apiUrl: env.NEXT_PUBLIC_API_URL,
      corsOrigins: env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    },
    demo: { authEnabled: env.DEMO_AUTH_ENABLED },
    db: { url: env.DATABASE_URL, directUrl: env.DIRECT_URL || env.DATABASE_URL },
    redis: { url: env.REDIS_URL, enabled: env.REDIS_URL.trim().length > 0 },
    security: { jwtSecret: env.JWT_SECRET, sessionSecret: env.SESSION_SECRET },
    locale: { defaultCurrency: env.DEFAULT_CURRENCY, defaultLocale: env.DEFAULT_LOCALE },
    business: {
      buyerPremiumPct: env.BUSINESS_BUYER_PREMIUM_PCT,
      sellerCommissionPct: env.BUSINESS_SELLER_COMMISSION_PCT,
      taxPct: env.BUSINESS_TAX_PCT,
      paymentDeadlineHours: env.BUSINESS_PAYMENT_DEADLINE_HOURS,
      collectionDeadlineDays: env.BUSINESS_COLLECTION_DEADLINE_DAYS,
    },
    features: {
      timedAuctions: env.FEATURE_TIMED_AUCTIONS,
      eoi: env.FEATURE_EOI,
      buyNow: env.FEATURE_BUY_NOW,
      makeOffer: env.FEATURE_MAKE_OFFER,
      sealedTender: env.FEATURE_SEALED_TENDER,
      liveAuctions: env.FEATURE_LIVE_AUCTIONS,
      cubeCatalogue: env.FEATURE_CUBE_CATALOGUE,
      aiListing: env.FEATURE_AI_LISTING,
      aiMediaEnhance: env.FEATURE_AI_MEDIA_ENHANCE,
      socialAutoPublish: env.FEATURE_SOCIAL_AUTO_PUBLISH,
      whatsappBidIntent: env.FEATURE_WHATSAPP_BID_INTENT,
    },
    providers: {
      storage: { configured: supabaseConfigured || env.STORAGE_ENDPOINT.trim().length > 0 },
      aiText: configured(env.AI_TEXT_API_KEY),
      aiVision: configured(env.AI_VISION_API_KEY),
      messagingMeta: configured(env.META_APP_SECRET),
      whatsapp: configured(env.WHATSAPP_TOKEN),
      sms: configured(env.SMS_API_KEY),
      email: configured(env.EMAIL_API_KEY),
      live: configured(env.LIVE_PROVIDER_KEY),
      youtube: configured(env.YOUTUBE_API_KEY),
      payment: configured(env.PAYMENT_PROVIDER_KEY),
    },
    supabase: {
      url: env.SUPABASE_URL,
      serviceKey: supabaseServerKey,
      anonKey: env.SUPABASE_ANON_KEY,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      storageBucket: env.SUPABASE_STORAGE_BUCKET,
      configured: supabaseConfigured,
    },
  };
}

let cached: AppConfig | undefined;

/** Memoized process-wide config. Call once at startup; safe to call repeatedly. */
export function getConfig(): AppConfig {
  cached ??= loadConfig();
  return cached;
}

/** Test helper — clears the memoized config. */
export function resetConfigCache(): void {
  cached = undefined;
}

/** Names of business values still awaiting product-owner approval. */
export function pendingBusinessApprovals(_config: AppConfig): (keyof BusinessConfig)[] {
  // In Phase 0 every placeholder is unconfirmed; surfaced on the admin health view.
  return [...BUSINESS_APPROVAL_REQUIRED];
}

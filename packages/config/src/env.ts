import { z } from 'zod';

/** Coerce common truthy string forms to boolean for env-var flags. */
const boolFromEnv = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
  return false;
}, z.boolean());

/**
 * Raw environment schema. Providers default to empty strings so a missing
 * credential means "not configured" (adapters fall back to mocks), never a crash.
 * DATABASE_URL is the only hard requirement for server processes.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  WORKER_METRICS_PORT: z.coerce.number().int().positive().default(4100),

  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),

  // Comma-separated allowed CORS origins ('*' = reflect any). Set to your web URL.
  CORS_ORIGINS: z.string().default('*'),
  // Passwordless demo login (email → bidder token). Disable for real production.
  DEMO_AUTH_ENABLED: boolFromEnv.default(true),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Direct (non-pooled) DB connection used for Prisma migrations (Supabase).
  DIRECT_URL: z.string().default(''),
  REDIS_URL: z.string().default(''),

  JWT_SECRET: z.string().min(1).default('dev-only-insecure-change-me'),
  SESSION_SECRET: z.string().min(1).default('dev-only-insecure-change-me'),

  DEFAULT_CURRENCY: z.string().min(1).default('LKR'),
  DEFAULT_LOCALE: z.string().min(1).default('en'),

  BUSINESS_BUYER_PREMIUM_PCT: z.coerce.number().min(0).default(0),
  BUSINESS_SELLER_COMMISSION_PCT: z.coerce.number().min(0).default(0),
  BUSINESS_TAX_PCT: z.coerce.number().min(0).default(0),
  BUSINESS_PAYMENT_DEADLINE_HOURS: z.coerce.number().int().positive().default(72),
  BUSINESS_COLLECTION_DEADLINE_DAYS: z.coerce.number().int().positive().default(14),

  FEATURE_TIMED_AUCTIONS: boolFromEnv.default(true),
  FEATURE_EOI: boolFromEnv.default(true),
  FEATURE_BUY_NOW: boolFromEnv.default(false),
  FEATURE_MAKE_OFFER: boolFromEnv.default(false),
  FEATURE_SEALED_TENDER: boolFromEnv.default(false),
  FEATURE_LIVE_AUCTIONS: boolFromEnv.default(false),
  FEATURE_CUBE_CATALOGUE: boolFromEnv.default(true),
  FEATURE_AI_LISTING: boolFromEnv.default(false),
  FEATURE_AI_MEDIA_ENHANCE: boolFromEnv.default(false),
  FEATURE_SOCIAL_AUTO_PUBLISH: boolFromEnv.default(false),
  FEATURE_WHATSAPP_BID_INTENT: boolFromEnv.default(false),

  STORAGE_ENDPOINT: z.string().default(''),
  STORAGE_BUCKET: z.string().default(''),
  STORAGE_ACCESS_KEY: z.string().default(''),
  STORAGE_SECRET_KEY: z.string().default(''),
  AI_TEXT_API_KEY: z.string().default(''),
  AI_VISION_API_KEY: z.string().default(''),
  META_APP_SECRET: z.string().default(''),
  WHATSAPP_TOKEN: z.string().default(''),
  SMS_API_KEY: z.string().default(''),
  EMAIL_API_KEY: z.string().default(''),
  LIVE_PROVIDER_KEY: z.string().default(''),
  YOUTUBE_API_KEY: z.string().default(''),
  PAYMENT_PROVIDER_KEY: z.string().default(''),

  // Supabase (Postgres + Storage). Server keys are never exposed to the browser.
  SUPABASE_URL: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  SUPABASE_SECRET_KEY: z.string().default(''),
  SUPABASE_ANON_KEY: z.string().default(''),
  SUPABASE_PUBLISHABLE_KEY: z.string().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().default('singha-media'),
});

export type RawEnv = z.infer<typeof envSchema>;

/** Parse + validate an environment record. Throws a readable aggregate error. */
export function parseEnv(
  source: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): RawEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

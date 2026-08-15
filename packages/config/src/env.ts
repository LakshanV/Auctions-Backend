import { z } from 'zod';

/**
 * The insecure development default for signing secrets. Production MUST override
 * it (enforced by assertProductionInvariants). Kept as a named constant so the
 * startup gate can detect it exactly.
 */
export const DEV_DEFAULT_SECRET = 'dev-only-insecure-change-me';

/** Minimum length policy for production signing secrets (pack FIX-09). */
export const MIN_PROD_SECRET_LENGTH = 32;

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

  JWT_SECRET: z.string().min(1).default(DEV_DEFAULT_SECRET),
  SESSION_SECRET: z.string().min(1).default(DEV_DEFAULT_SECRET),

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

  // V3 experience flags (pack doc 21). All default OFF so production stays on the
  // current UI; each is server/config-controlled for rapid rollback without a code
  // change, and surfaced via GET /api/v1/feature-flags for the frontend to gate on.
  FEATURE_V3_VISUAL_ARCHITECTURE: boolFromEnv.default(false),
  FEATURE_V3_FLOW_MATRIX: boolFromEnv.default(false),
  FEATURE_V3_CATEGORY_OVERLAY: boolFromEnv.default(false),
  FEATURE_V3_FEATURED_REEL: boolFromEnv.default(false),
  FEATURE_V3_DISCOVER: boolFromEnv.default(false),
  FEATURE_V3_BUYER_TWIN: boolFromEnv.default(false),
  FEATURE_V3_BID_BATTLE: boolFromEnv.default(false),
  FEATURE_V3_GESTURE_BID: boolFromEnv.default(false),
  FEATURE_V3_ENGAGEMENT: boolFromEnv.default(false),
  FEATURE_V3_DASHBOARD_BETA: boolFromEnv.default(false),
  FEATURE_V3_LIVE: boolFromEnv.default(false),

  // Singha Evolution config foundations (E2). All default OFF.
  FEATURE_MULTI_OPERATOR: boolFromEnv.default(false),
  FEATURE_STRUCTURED_LOCATIONS: boolFromEnv.default(false),
  FEATURE_QUANTITY_UNITS: boolFromEnv.default(false),
  FEATURE_SALE_METHOD_CONFIG: boolFromEnv.default(false),

  // Singha Evolution Commercial Offer Engine V2 (E4). All default OFF.
  FEATURE_COMMERCIAL_OFFERS_V2: boolFromEnv.default(false),
  FEATURE_SEALED_OFFERS: boolFromEnv.default(false),

  // Singha Evolution Currency / FX (E5). All default OFF.
  FEATURE_MULTI_CURRENCY: boolFromEnv.default(false),
  FEATURE_FX_DISPLAY: boolFromEnv.default(false),

  // Singha Evolution Transaction Routing + Terms (E6). Default OFF.
  FEATURE_TRANSACTION_ROUTING: boolFromEnv.default(false),

  // Singha Evolution Logistics / Ports / Incoterms (E7). Default OFF.
  FEATURE_LOGISTICS: boolFromEnv.default(false),
  FEATURE_LOGISTICS_QUOTES: boolFromEnv.default(false),

  // Singha Evolution Fees / Tax / Rules engine (E8). Default OFF.
  FEATURE_FEES_ENGINE: boolFromEnv.default(false),

  // Singha Evolution Payment orchestration (E8b). Default OFF. Webhook secret is server-only.
  FEATURE_OPERATOR_PAYMENTS: boolFromEnv.default(false),
  PAYMENT_WEBHOOK_SECRET: z.string().default(''),

  // Singha Evolution Procurement / two-sided market (E9). Default OFF.
  FEATURE_PROCUREMENT: boolFromEnv.default(false),

  // Singha Evolution Supply Programmes + perishable goods (E10). Default OFF.
  FEATURE_SUPPLY_PROGRAMMES: boolFromEnv.default(false),
  FEATURE_PERISHABLE_GOODS: boolFromEnv.default(false),

  // FX rate provider (Evolution E5 / DECISIONS D12 — Google currency). Empty = not configured,
  // so the deterministic fake is used and no binding path depends on a live rate. Server-only.
  FX_API_URL: z.string().default(''),
  FX_API_KEY: z.string().default(''),

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

/**
 * Fail-closed production invariants (pack FIX-09 / doc 02). In production the
 * process MUST refuse to start on any insecure default. This is a hard gate: it
 * throws, and the caller (loadConfig) does not catch it. Non-production
 * environments are unaffected so local/dev/test/e2e keep working.
 */
export function assertProductionInvariants(env: RawEnv): void {
  if (env.NODE_ENV !== 'production') return;

  const problems: string[] = [];
  const weak = (secret: string, name: string): void => {
    if (secret === DEV_DEFAULT_SECRET) problems.push(`${name} is the insecure development default`);
    else if (secret.length < MIN_PROD_SECRET_LENGTH)
      problems.push(`${name} is shorter than the ${MIN_PROD_SECRET_LENGTH}-char minimum`);
  };

  if (env.DEMO_AUTH_ENABLED) {
    problems.push('DEMO_AUTH_ENABLED must be false in production');
  }
  weak(env.JWT_SECRET, 'JWT_SECRET');
  weak(env.SESSION_SECRET, 'SESSION_SECRET');

  const origins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.includes('*')) {
    problems.push('CORS_ORIGINS must be an explicit allowlist (no wildcard) in production');
  }

  // Real production auth verifies Supabase sessions, so the project URL is
  // mandatory (demo/dev token paths are disabled in production).
  if (env.SUPABASE_URL.trim().length === 0) {
    problems.push('SUPABASE_URL is required in production (real session verification)');
  }

  if (problems.length > 0) {
    throw new Error(
      'Refusing to start: insecure production configuration:\n' +
        problems.map((p) => `  - ${p}`).join('\n'),
    );
  }
}

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
  assertProductionInvariants(result.data);
  return result.data;
}

import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

/**
 * Secret redaction (docs/15: "log redaction"). Never let credentials, tokens or
 * connection strings reach logs. Operational logs are diagnostics — distinct
 * from the append-only audit log (business evidence).
 */
const REDACT_PATHS = [
  'password',
  '*.password',
  'authorization',
  'req.headers.authorization',
  'headers.authorization',
  'token',
  '*.token',
  'accessToken',
  'refreshToken',
  'secret',
  '*.secret',
  'jwtSecret',
  'sessionSecret',
  'apiKey',
  '*.apiKey',
  'DATABASE_URL',
  'REDIS_URL',
  '*.creditCard',
  'card',
];

export interface CreateLoggerOptions {
  /** Service name — e.g. "api", "worker". Emitted on every line. */
  name: string;
  level?: string;
}

/**
 * Structured JSON logger. Pass a custom destination for tests. In production the
 * default (stdout) is collected by the platform; no pretty transport is bundled.
 */
export function createLogger(opts: CreateLoggerOptions, destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    name: opts.name,
    level: opts.level ?? process.env.LOG_LEVEL ?? 'info',
    base: { service: opts.name },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

export type { Logger };

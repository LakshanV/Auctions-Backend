import { describe, expect, it } from 'vitest';
import { loadConfig } from './index';

/**
 * Pack FIX-09 / security matrix S13–S15: production must FAIL CLOSED on insecure
 * configuration. These are negative regression tests — each asserts the process
 * refuses to build its config (and therefore refuses to start).
 */
const prodBase = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/postgres',
  JWT_SECRET: 'a'.repeat(48),
  SESSION_SECRET: 'b'.repeat(48),
  CORS_ORIGINS: 'https://auctions.example.com',
  SUPABASE_URL: 'https://project.supabase.co',
  DEMO_AUTH_ENABLED: 'false',
};

describe('production fail-closed invariants', () => {
  it('accepts a fully-valid production configuration', () => {
    expect(() => loadConfig(prodBase)).not.toThrow();
  });

  it('S13: rejects demo auth enabled in production', () => {
    expect(() => loadConfig({ ...prodBase, DEMO_AUTH_ENABLED: 'true' })).toThrow(
      /DEMO_AUTH_ENABLED/,
    );
  });

  it('S14: rejects the insecure default JWT secret in production', () => {
    expect(() => loadConfig({ ...prodBase, JWT_SECRET: 'dev-only-insecure-change-me' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('S14b: rejects a too-short JWT secret in production', () => {
    expect(() => loadConfig({ ...prodBase, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects the insecure default session secret in production', () => {
    expect(() =>
      loadConfig({ ...prodBase, SESSION_SECRET: 'dev-only-insecure-change-me' }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('S15: rejects wildcard CORS in production', () => {
    expect(() => loadConfig({ ...prodBase, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
  });

  it('rejects empty CORS in production', () => {
    expect(() => loadConfig({ ...prodBase, CORS_ORIGINS: '' })).toThrow(/CORS_ORIGINS/);
  });

  it('rejects missing Supabase URL in production', () => {
    expect(() => loadConfig({ ...prodBase, SUPABASE_URL: '' })).toThrow(/SUPABASE_URL/);
  });

  it('leaves development untouched (insecure defaults allowed locally)', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' })).not.toThrow();
  });
});

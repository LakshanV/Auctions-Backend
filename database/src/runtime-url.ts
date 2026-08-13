/**
 * Resolve the datasource URL used by the *long-running* Prisma client (API + worker).
 *
 * Supabase exposes two pooler ports on `*.pooler.supabase.com`:
 *   - `:5432` SESSION mode  — one dedicated server connection per client; capped at
 *     `pool_size` (15 by default). Correct for migrations (advisory locks + DDL).
 *   - `:6543` TRANSACTION mode — multiplexed via pgbouncer; a long-running app can hold
 *     a client-side pool without ever consuming a scarce session slot.
 *
 * If the app runtime connects on `:5432`, its idle Prisma pool exhausts all 15 session
 * slots, and a redeploy's `prisma migrate deploy` (also `:5432`, via DIRECT_URL) can never
 * get a connection while the old replica holds the pool → permanent deploy deadlock
 * (`FATAL: max clients reached in session mode`).
 *
 * So: when `DATABASE_URL` points at the Supabase SESSION pooler (`:5432`), transparently
 * route the *runtime* client to the TRANSACTION pooler (`:6543`, `pgbouncer=true`). Migrations
 * keep using `DIRECT_URL` (`:5432`) unchanged. This keeps the session pool free and makes the
 * deadlock structurally impossible even if the Railway env still points `DATABASE_URL` at `:5432`.
 *
 * No-ops (returns the URL unchanged) when: not a Supabase pooler host, already on a non-5432
 * port (operator already moved it to `:6543`), a direct `db.*.supabase.co` connection, or when
 * disabled via `PRISMA_DISABLE_POOLER_REWRITE=true`.
 */
export function resolveRuntimeDatasourceUrl(
  rawUrl: string | undefined = process.env.DATABASE_URL,
): string | undefined {
  if (!rawUrl) return undefined;
  if (process.env.PRISMA_DISABLE_POOLER_REWRITE === 'true') return rawUrl;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl; // not parseable — leave as-is
  }

  const isSupabasePooler = url.hostname.endsWith('.pooler.supabase.com');
  if (!isSupabasePooler || url.port !== '5432') return rawUrl;

  url.port = '6543';
  // Transaction-mode pgbouncer requires prepared statements off (Prisma honours pgbouncer=true).
  url.searchParams.set('pgbouncer', 'true');
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', process.env.PRISMA_CONNECTION_LIMIT ?? '5');
  }

  // Redacted breadcrumb so the routing is visible in deploy logs (never log credentials).
  // eslint-disable-next-line no-console
  console.log(
    `[prisma] runtime datasource routed to Supabase transaction pooler ${url.hostname}:6543 (pgbouncer=true); migrations still use DIRECT_URL :5432`,
  );

  return url.toString();
}

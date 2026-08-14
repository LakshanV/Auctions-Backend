# Railway — Required Production Configuration

> Created per Revision 05 §2. Claude Code cannot access the Railway project
> settings/secrets, so the required production configuration is documented here for
> a human operator to apply. The service **fails closed** — it refuses to boot in
> production unless the security-critical values below are set correctly.

## Service

- **Repo/branch:** `LakshanV/Auctions-Backend`, deploy from `main`.
- **Runtime:** Node **22+** (matches `engines.node` and CI).
- **Build/start:** Dockerfile (existing). Health/readiness probes:
  - Liveness: `GET /healthz`
  - Readiness: `GET /readyz`
- **Migrations:** run `pnpm supabase:deploy` (`prisma migrate deploy`) against the
  Supabase DB on each release **before** traffic is served. This applies the new
  `20260812090000_member_credit_security` migration (additive, safe).

## Required environment variables

| Variable                          | Required value / note                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                        | `production`                                                                                                |
| `DEMO_AUTH_ENABLED`               | **`false`** — disables `/auth/demo`. The service must fail closed if this is not `false` in production.     |
| `DATABASE_URL`                    | Supabase **TRANSACTION pooler**, port **6543**, `?pgbouncer=true` (app runtime). See §Database connections. |
| `DIRECT_URL`                      | Supabase **SESSION pooler**, port **5432** (migrations only). See §Database connections.                    |
| `JWT_SECRET` / session secret     | A strong, unique, rotated secret. No default/placeholder in production.                                     |
| `SUPABASE_URL`                    | Project URL (for JWKS verification of real Supabase JWTs).                                                  |
| `SUPABASE_ANON_KEY` / service key | As required by the auth + storage adapters.                                                                 |
| `SUPABASE_MEDIA_BUCKET`           | e.g. `singha-media`.                                                                                        |
| `CORS_ORIGINS`                    | **Explicit** origin list (the Vercel domain), never `*` in production.                                      |
| `PORT`                            | Provided by Railway; the app binds `0.0.0.0:$PORT`.                                                         |
| `REDIS_URL`                       | Optional — enables cross-instance realtime; absent → in-process fan-out.                                    |

### Database connections — CRITICAL (fixes deploy `EMAXCONNSESSION` crash-loop)

Supabase exposes three endpoints for project ref `ygsfdehdwkkwllekjykx` in region
`ap-south-1`. From Railway the direct `db.<ref>.supabase.co` host is **not reachable**
(Supabase deprecated IPv4 there), so both URLs must use the **pooler** host
`aws-0-ap-south-1.pooler.supabase.com` with the pooler username `postgres.<ref>`:

- **App runtime — TRANSACTION pooler (port 6543).** Multiplexes; does NOT hold a
  dedicated server connection per client, so it cannot exhaust the session cap.

  ```
  DATABASE_URL=postgresql://postgres.ygsfdehdwkkwllekjykx:<PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5
  ```

- **Migrations — SESSION pooler (port 5432).** Prisma migrate needs a session/direct
  connection (advisory locks + DDL); it must NOT go through the transaction pooler.

  ```
  DIRECT_URL=postgresql://postgres.ygsfdehdwkkwllekjykx:<PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
  ```

URL-encode any specials in `<PASSWORD>` (`#`→`%23`, `@`→`%40`). Same password as the
existing direct string.

**Why the deploy was crash-looping (`FATAL: max clients reached in session mode …
pool_size: 15`).** If `DATABASE_URL` points at the SESSION pooler (`:5432`), the
long-running API opens a Prisma pool (~9–17 conns) and holds those session slots. On
a zero-downtime redeploy the OLD replica keeps them until the NEW replica is healthy —
but the new replica's `prisma migrate deploy` (also on `:5432`) can never acquire a
slot, so it never becomes healthy → permanent deploy deadlock. Moving `DATABASE_URL`
to the `:6543` transaction pooler frees the session pool for migrations.

**One-time unblock after changing the vars:** the stuck old replica may still be
holding the session pool. In Railway, **Restart** (or Stop → Start) the service once so
those connections drop, then redeploy. Optionally raise the pool size in Supabase
Dashboard → Database → Connection pooling if 15 is tight for your concurrency.

`scripts/start.sh` also retries `migrate deploy` with backoff (`MIGRATE_MAX_ATTEMPTS`,
`MIGRATE_RETRY_SLEEP`) so _transient_ redeploy overlap self-heals — but that only helps
once `DATABASE_URL` is off the session pooler.

### Member / credit engine (Revision 05) — optional tuning

| Variable / config                         | Default        | Note                                                                                                                                                                                           |
| ----------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BusinessConfig` key `credit.enforcement` | `facility`     | `off` \| `facility` \| `strict`. `facility` enforces bid capacity only when the bidder holds a credit facility (cash bidders unaffected). Set to `strict` to require a facility for every bid. |
| Required-security ratio                   | `500` bps (5%) | Per-facility `requiredSecurityBps`; set on credit approval, not env.                                                                                                                           |

## Post-deploy smoke (Revision 05 §29)

```
GET /healthz                 → 200
GET /readyz                  → 200
GET /api/v2/catalogue        → 200 (JSON catalogue)
GET /api/v2/catalogue/row    → 200 (single Flow category row)
POST /auth/demo              → 404/disabled in production
```

## Fail-closed invariants (must hold in production)

- `/auth/demo` disabled (`DEMO_AUTH_ENABLED=false`); `/dev/token` returns 404.
- Strong JWT/session secret set (no fallback default).
- CORS is an explicit allow-list.
- Sensitive member/credit/security actions require AAL2 server-side.
- All bid/payment/audit history remains append-only.

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

| Variable                          | Required value / note                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                        | `production`                                                                                            |
| `DEMO_AUTH_ENABLED`               | **`false`** — disables `/auth/demo`. The service must fail closed if this is not `false` in production. |
| `DATABASE_URL`                    | Supabase **pooled** connection string (app runtime).                                                    |
| `DIRECT_URL`                      | Supabase **direct** (non-pooled) connection string (migrations).                                        |
| `JWT_SECRET` / session secret     | A strong, unique, rotated secret. No default/placeholder in production.                                 |
| `SUPABASE_URL`                    | Project URL (for JWKS verification of real Supabase JWTs).                                              |
| `SUPABASE_ANON_KEY` / service key | As required by the auth + storage adapters.                                                             |
| `SUPABASE_MEDIA_BUCKET`           | e.g. `singha-media`.                                                                                    |
| `CORS_ORIGINS`                    | **Explicit** origin list (the Vercel domain), never `*` in production.                                  |
| `PORT`                            | Provided by Railway; the app binds `0.0.0.0:$PORT`.                                                     |
| `REDIS_URL`                       | Optional — enables cross-instance realtime; absent → in-process fan-out.                                |

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

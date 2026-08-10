# SUPABASE + VERCEL SETUP

Supabase is the authoritative **database** (Postgres) and **object storage**.
Project ref: `ygsfdehdwkkwllekjykx`. The schema (5 migrations), seed (feature
flags + business config) and the `singha-media` storage bucket are already
provisioned and verified against the live project.

## Secrets — where they live

Real credentials are in **gitignored** files and are never committed:

- `/.env` — API/worker/Prisma (DATABASE_URL, DIRECT_URL, SUPABASE_\* incl. the
  server-only secret/service_role keys, generated JWT/SESSION secrets).
- `/apps/web/.env.local` — the web app (NEXT*PUBLIC*\* only — publishable key).

`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are **server-only** (they
bypass RLS). Never expose them to the browser or commit them. Rotate in the
Supabase dashboard if they leak.

## Local development

```bash
pnpm install
pnpm supabase:deploy   # apply committed migrations to Supabase (uses DIRECT_URL)
pnpm supabase:seed     # feature flags + business-config placeholders

# API against Supabase (loads /.env):
node --env-file=.env apps/api/dist/main.js     # after: pnpm --filter @singha/api build
# Web against Supabase:
pnpm --filter @singha/web dev                  # reads apps/web/.env.local
```

## Deploying the WEB app to Vercel (works today)

Vercel hosts the Next.js web app. `vercel.json` sets the monorepo build
(`turbo run build --filter=@singha/web`, output `apps/web/.next`).

Vercel → Project → Settings → Environment Variables (Production + Preview):

| Variable                               | Value                                      |
| -------------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://ygsfdehdwkkwllekjykx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your `sb_publishable_…` key                |
| `NEXT_PUBLIC_API_URL`                  | the deployed API base URL                  |

The web uses the Supabase browser/SSR client (`apps/web/src/utils/supabase/*`)
with session-refresh middleware (`apps/web/src/middleware.ts`).

## Hosting the API + worker (honest note)

The **NestJS API** and **BullMQ worker** are long-running, stateful services
(the auction engine uses `SELECT … FOR UPDATE` transactions; the worker needs a
persistent process + Redis). **Vercel serverless is not a fit for them** — host
them on a container platform (Railway, Render, Fly.io, or any Node host).

API/worker host env vars: everything in `/.env` — `DATABASE_URL`, `DIRECT_URL`,
`SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`),
`SUPABASE_STORAGE_BUCKET`, `JWT_SECRET`, `SESSION_SECRET`, `REDIS_URL` (when
enabled). Set a **strong** `JWT_SECRET` in production.

### Serverless database connections

If you later run the API on serverless, switch `DATABASE_URL` to the Supabase
**Transaction pooler** (Dashboard → Database → Connection pooling, port `6543`,
append `?pgbouncer=true`). Keep `DIRECT_URL` on the direct `:5432` endpoint for
migrations. On a normal container host the direct connection is fine.

### Want everything on Vercel?

That requires folding the API's command/query handlers into Next.js Route
Handlers / Server Actions (Prisma against the Supabase pooler) and replacing the
BullMQ worker with Vercel Cron for the auction close-sweep. That's a deliberate
follow-up refactor — say the word and it can be done.

## Storage

Media uploads use a direct-to-Supabase grant: `POST /api/v1/assets/:id/media/upload-url`
returns a signed upload URL (bucket `singha-media`), so large files never pass
through the API. Verified end-to-end against the live project.

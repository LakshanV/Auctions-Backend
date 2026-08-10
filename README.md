# Singha Auctions — Backend

NestJS API + BullMQ worker for **Singha Auctions V2**. Database + object storage
on **Supabase**. Deploys to **Railway** via the included `Dockerfile`.

The full product spec lives in [`CLAUDE.md`](./CLAUDE.md) + [`docs/`](./docs).

## Deploy to Railway

1. Push this repo to GitHub.
2. Railway → **New Project → Deploy from GitHub repo** → select this repo.
   Railway detects the `Dockerfile` and `railway.json` automatically.
3. Add environment variables (Service → **Variables**) — see `.env.example`. Minimum:
   - `DATABASE_URL`, `DIRECT_URL` — Supabase (URL-encode the password)
   - `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET`
   - `JWT_SECRET` (strong), `CORS_ORIGINS` (your Vercel URL, or `*`), `DEMO_AUTH_ENABLED`
4. Deploy. Healthcheck is `/healthz`. On boot the container runs
   `prisma migrate deploy` then starts the API.
5. Copy the public URL Railway gives you → set it as `NEXT_PUBLIC_API_URL` in your
   frontend (Vercel) and add that Vercel URL to `CORS_ORIGINS` here.

## Worker (optional — second service)

The worker needs Redis (BullMQ). Add a **Redis** database on Railway, then create a
**second service** from the same repo with Start Command
`node apps/worker/dist/main.js` and `REDIS_URL` set. Without `REDIS_URL` it idles.

## Local development

```bash
cp .env.example .env          # fill in Supabase creds
pnpm install
pnpm db:migrate:deploy        # apply migrations
pnpm demo:seed                # optional: demo catalogue
pnpm --filter @singha/api build
node --env-file=.env apps/api/dist/main.js
```

## Verify

```bash
pnpm run check         # format + lint + typecheck + build + unit tests
pnpm run test:db       # ephemeral Postgres: migrations + integration
pnpm run test:auction  # auction concurrency + soft-close E2E
```

## Structure

```
apps/api        NestJS API (/api/v1): catalogue, auth (demo login), auctions/bids,
                identity, inventory, marketplace, media, feature-flags, health
apps/worker     Transactional-outbox dispatcher (BullMQ; idles without REDIS_URL)
packages/       contracts · config · domain (auction engine) · observability · test-utils
database/       Prisma schema + migrations + client (@singha/database)
```

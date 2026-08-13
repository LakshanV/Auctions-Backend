#!/bin/sh
# Container entrypoint: apply pending Prisma migrations, then run the API.
#
# Why the retry loop:
#   `prisma migrate deploy` uses DIRECT_URL, which on Supabase is the SESSION-mode
#   pooler (:5432). Session mode caps concurrent clients at `pool_size` (15 by
#   default). During a Railway zero-downtime redeploy the OLD instance can still be
#   holding session slots for a few seconds, so the new instance's migrate may hit
#   `FATAL: max clients reached in session mode (EMAXCONNSESSION)` transiently.
#   Retrying with backoff lets that self-heal instead of crash-looping the deploy.
#
#   NOTE: this only cures the *transient* overlap. The durable fix is that the app
#   runtime DATABASE_URL must use the TRANSACTION pooler (:6543, ?pgbouncer=true) so
#   the long-running API never holds session slots on :5432. See
#   RAILWAY_REQUIRED_CONFIGURATION.md. If DATABASE_URL points at :5432 session
#   mode, no retry count can help — the old replica holds the pool permanently.
set -e

MAX_ATTEMPTS="${MIGRATE_MAX_ATTEMPTS:-12}"
SLEEP_SECONDS="${MIGRATE_RETRY_SLEEP:-6}"

migrated=0
attempt=1
while [ "${attempt}" -le "${MAX_ATTEMPTS}" ]; do
  if pnpm --filter @singha/database exec prisma migrate deploy; then
    echo "[start] migrations applied (attempt ${attempt})"
    migrated=1
    break
  fi
  echo "[start] migrate deploy attempt ${attempt} failed; retrying in ${SLEEP_SECONDS}s..." >&2
  attempt=$((attempt + 1))
  sleep "${SLEEP_SECONDS}"
done

if [ "${migrated}" -ne 1 ]; then
  # migrate deploy needs the SESSION pooler (:5432); during a redeploy the old replica can
  # hold all 15 session slots (EMAXCONNSESSION), so it can't get in. Fall back to checking —
  # over the runtime datasource (:6543 transaction pooler, still reachable) — whether the DB is
  # already up to date. If so it's safe to boot: passing the healthcheck lets Railway retire the
  # old replica and free the session pool. If a real migration is pending, we must NOT boot.
  echo "[start] migrate deploy exhausted retries; checking whether the DB is already current..." >&2
  node scripts/migrations-current.mjs
  case "$?" in
    0) echo "[start] DB already up to date — booting without applying migrations" >&2 ;;
    *) echo "[start] pending migration or check failed — aborting (won't serve a stale schema)" >&2
       echo "[start] if the error is EMAXCONNSESSION, free the :5432 session pool or move DATABASE_URL to :6543" >&2
       exit 1 ;;
  esac
fi

echo "[start] starting API"
# exec so the Node process is PID 1's replacement and receives SIGTERM for graceful shutdown.
exec node apps/api/dist/main.js

#!/usr/bin/env bash
#
# Reseed the demo marketplace (SMKT-*) so MediaObject cover keys point at the committed PNG covers
# in the frontend (public/demo/smkt/<cat>/smkt-<cat3>-NN-1.png). Idempotent: resets the prior SIM
# rows (bid-bearing auctions are preserved by the reset) then reseeds with cover-only PNG media.
#
# Bakes in the demo IMAGE settings only (harmless formatting); it deliberately does NOT bake the
# production safety confirmation — you must set SINGHA_SIM_CONFIRM=I_UNDERSTAND yourself when the
# target is production, so the seeder's guard stays meaningful.
#
# Usage (local / CI / a box with network + the prod URL):
#   DATABASE_URL='postgresql://…prod…' SINGHA_SIM_CONFIRM=I_UNDERSTAND \
#     bash database/prisma/reseed-demo-covers.sh
#
# Usage (Railway — injects the service's own DATABASE_URL):
#   railway run --service <api> bash -lc \
#     'SINGHA_SIM_CONFIRM=I_UNDERSTAND bash database/prisma/reseed-demo-covers.sh'
#
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set. Point it at the target database." >&2
  exit 1
fi

# Prisma Client reads DATABASE_URL; DIRECT_URL only matters for migrations — mirror it so client
# init never trips on an undefined env var.
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

# Cover set produced by the owner upload: PNG, one cover per image-bearing listing.
export DEMO_MEDIA_EXT="${DEMO_MEDIA_EXT:-png}"
export DEMO_IMAGES_PER_LISTING="${DEMO_IMAGES_PER_LISTING:-1}"
# Leave DEMO_MEDIA_BASE unset → bare `demo/…` keys that resolve same-origin on any deployment.

masked="$(printf '%s' "$DATABASE_URL" | sed -E 's#://[^@]*@#://***@#')"
echo "→ target:  $masked"
echo "→ media:   ext=$DEMO_MEDIA_EXT images/listing=$DEMO_IMAGES_PER_LISTING (cover-only)"
echo "→ confirm: SINGHA_SIM_CONFIRM=${SINGHA_SIM_CONFIRM:-<unset>}"
echo

echo "== reset (prior SIM rows; bid-bearing auctions preserved) =="
pnpm --filter @singha/database run seed:marketplace:reset

echo "== seed (SMKT listings + PNG cover media) =="
pnpm --filter @singha/database run seed:marketplace

echo
echo "✔ Done. Verify: open the catalogue on the deployed site — cover images should render."

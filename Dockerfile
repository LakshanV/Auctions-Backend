# Railway builds this Dockerfile. Node 22 (Debian slim) + OpenSSL for Prisma.
# Node 22 is required: @supabase/supabase-js initialises a realtime client that
# needs a native WebSocket, which ships by default only in Node 22+.
FROM node:22-slim

RUN corepack enable \
  && apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install workspace deps (dev deps included — Prisma CLI + build tooling).
COPY . .
RUN pnpm install --frozen-lockfile

# Generate the Prisma client and build the API (+ worker).
RUN pnpm --filter @singha/database run generate \
  && pnpm turbo run build --filter=@singha/api --filter=@singha/worker

EXPOSE 4000

# Apply pending migrations (idempotent) then start the API. Railway injects PORT.
CMD ["sh", "-c", "pnpm --filter @singha/database exec prisma migrate deploy && node apps/api/dist/main.js"]

-- CreateTable
CREATE TABLE "fx_rate_snapshot" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "margin_bps" INTEGER NOT NULL DEFAULT 0,
    "quoted_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rate_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fx_rate_snapshot_base_quote_provider_quoted_at_idx" ON "fx_rate_snapshot"("base", "quote", "provider", "quoted_at");


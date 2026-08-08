/*
  Warnings:

  - Adds an occurrence ordinal so repeated imports can be deduped without
    dropping distinct same-day transactions that share merchant, amount, and date.

*/
-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "occurrence" INTEGER NOT NULL DEFAULT 1;

-- Backfill unique ordinals for any existing duplicates before adding the index.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "cardId", "merchant", "amount", "date"
      ORDER BY "createdAt", "id"
    ) AS rn
  FROM "Transaction"
)
UPDATE "Transaction" AS t
SET "occurrence" = ranked.rn
FROM ranked
WHERE t."id" = ranked."id";

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_occurrence_key" ON "Transaction"("cardId", "merchant", "amount", "date", "occurrence");

-- CreateIndex
CREATE INDEX "Transaction_cardId_merchant_date_idx" ON "Transaction"("cardId", "merchant", "date");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_cardId_merchant_idx" ON "Subscription"("cardId", "merchant");

-- CreateIndex
CREATE INDEX "Alert_userId_type_scheduledAt_idx" ON "Alert"("userId", "type", "scheduledAt");

-- CreateIndex
CREATE INDEX "Alert_userId_type_idx" ON "Alert"("userId", "type");

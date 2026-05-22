/*
  Align deployed databases with the Prisma schema changes that made transaction
  imports idempotent and added lookup indexes used by subscription jobs.
*/

-- Remove exact duplicate imported transactions before adding the uniqueness
-- constraint used by createMany({ skipDuplicates: true }).
DELETE FROM "Transaction" duplicate
USING "Transaction" original
WHERE duplicate."cardId" = original."cardId"
  AND duplicate."merchant" = original."merchant"
  AND duplicate."amount" = original."amount"
  AND duplicate."date" = original."date"
  AND (
    duplicate."createdAt" > original."createdAt"
    OR (
      duplicate."createdAt" = original."createdAt"
      AND duplicate."id" > original."id"
    )
  );

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_cardId_merchant_amount_date_key" ON "Transaction"("cardId", "merchant", "amount", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_cardId_merchant_date_idx" ON "Transaction"("cardId", "merchant", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Subscription_cardId_merchant_idx" ON "Subscription"("cardId", "merchant");

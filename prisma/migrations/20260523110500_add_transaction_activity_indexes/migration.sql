-- Remove exact duplicate transaction rows before adding the uniqueness
-- constraint that backs createMany({ skipDuplicates: true }).
WITH ranked_transactions AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "cardId", "merchant", "amount", "date"
      ORDER BY "createdAt", "id"
    ) AS row_number
  FROM "Transaction"
)
DELETE FROM "Transaction"
WHERE "id" IN (
  SELECT "id"
  FROM ranked_transactions
  WHERE row_number > 1
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_cardId_merchant_amount_date_key"
ON "Transaction"("cardId", "merchant", "amount", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_cardId_merchant_date_idx"
ON "Transaction"("cardId", "merchant", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Subscription_status_idx"
ON "Subscription"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Subscription_cardId_merchant_idx"
ON "Subscription"("cardId", "merchant");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Alert_userId_type_scheduledAt_idx"
ON "Alert"("userId", "type", "scheduledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Alert_userId_type_idx"
ON "Alert"("userId", "type");

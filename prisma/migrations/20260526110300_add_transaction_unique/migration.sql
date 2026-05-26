-- Remove duplicate rows that the application now treats as re-imported
-- statement lines before enforcing the de-duplication constraint.
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
USING ranked_transactions
WHERE "Transaction"."id" = ranked_transactions."id"
  AND ranked_transactions.row_number > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_key" ON "Transaction"("cardId", "merchant", "amount", "date");

-- CreateIndex
CREATE INDEX "Transaction_cardId_merchant_date_idx" ON "Transaction"("cardId", "merchant", "date");

-- Preserve same-day equal-amount charge/refund pairs. The previous unique key
-- treated opposite transaction directions as duplicates and silently skipped one.
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";
ALTER TABLE "Transaction"
  DROP CONSTRAINT IF EXISTS "Transaction_cardId_merchant_amount_date_key";

CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_type_key"
  ON "Transaction"("cardId", "merchant", "amount", "date", "type");

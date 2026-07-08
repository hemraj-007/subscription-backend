-- Preserve same-day equal amount charge/refund pairs from the same merchant.
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";

CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_type_key"
ON "Transaction"("cardId", "merchant", "amount", "date", "type");

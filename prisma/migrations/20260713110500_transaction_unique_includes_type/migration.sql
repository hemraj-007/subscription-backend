-- Replace the pre-transaction-type dedupe key so same-day charge/refund pairs
-- with equal absolute amounts are both preserved.
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_type_key" ON "Transaction"("cardId", "merchant", "amount", "date", "type");

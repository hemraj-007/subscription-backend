-- Preserve same-day equal-amount debit/credit counterparts as distinct transactions.
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_cardId_merchant_amount_date_key";
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";

CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_type_key"
  ON "Transaction"("cardId", "merchant", "amount", "date", "type");

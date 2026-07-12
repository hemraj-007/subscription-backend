-- Allow same-day equal-amount debit/credit pairs to coexist. The previous
-- unique key treated refunds as duplicates of charges and createMany skipped them.
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_cardId_merchant_amount_date_key";

CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_type_key"
  ON "Transaction"("cardId", "merchant", "amount", "date", "type");

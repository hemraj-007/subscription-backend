-- Preserve same-day equal amount charge/refund pairs by including transaction type
-- in the dedupe key used by createMany({ skipDuplicates: true }).
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_cardId_merchant_amount_date_key";
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";

CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_type_key"
ON "Transaction"("cardId", "merchant", "amount", "date", "type");

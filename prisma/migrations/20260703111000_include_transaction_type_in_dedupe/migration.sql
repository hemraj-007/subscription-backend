-- Include debit/credit direction in transaction de-duplication so an equal
-- charge and refund on the same card/date/merchant/amount can both be stored.
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";

CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_type_key"
ON "Transaction"("cardId", "merchant", "amount", "date", "type");

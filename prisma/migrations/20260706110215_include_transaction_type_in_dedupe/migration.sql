-- Replace the transaction de-dupe index so a same-day debit and credit with
-- the same merchant and amount are both preserved.
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";

CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_type_date_key"
ON "Transaction"("cardId", "merchant", "amount", "type", "date");

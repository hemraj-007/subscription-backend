-- Preserve legitimate same-day debit/credit pairs that share merchant, amount, and date.
DROP INDEX "Transaction_cardId_merchant_amount_date_key";

CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_type_key"
ON "Transaction"("cardId", "merchant", "amount", "date", "type");

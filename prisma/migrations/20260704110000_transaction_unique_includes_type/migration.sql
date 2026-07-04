-- Preserve same-day equal-amount debit/credit counterparts as distinct transactions.
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_cardId_merchant_amount_date_key";

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_cardId_merchant_amount_date_type_key"
  UNIQUE ("cardId", "merchant", "amount", "date", "type");

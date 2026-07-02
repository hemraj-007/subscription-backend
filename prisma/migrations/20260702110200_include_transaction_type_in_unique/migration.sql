-- Opposite-direction transactions can share card, merchant, amount, and date
-- (for example a purchase and same-day refund). Keep both rows distinct.
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";

CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_type_key"
  ON "Transaction"("cardId", "merchant", "amount", "date", "type");

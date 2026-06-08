-- Drop the over-broad transaction dedupe key. Two legitimate statement rows can
-- share card, merchant, amount, and date, and both must be preserved.
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";

-- Preserve legitimate same-day duplicate charges. The previous coarse
-- dedupe key treated identical card/merchant/amount/date rows as duplicates.
DROP INDEX IF EXISTS "Transaction_cardId_merchant_amount_date_key";

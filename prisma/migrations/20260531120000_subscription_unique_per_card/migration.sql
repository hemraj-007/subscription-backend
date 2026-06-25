-- Drop global per-user merchant+amount unique; subscriptions are per card.
DROP INDEX IF EXISTS "Subscription_userId_merchant_amount_key";

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_cardId_merchant_amount_key" ON "Subscription"("userId", "cardId", "merchant", "amount");

-- Allow the same user to have the same subscription merchant and amount on different cards.
DROP INDEX "Subscription_userId_merchant_amount_key";

CREATE UNIQUE INDEX "Subscription_userId_cardId_merchant_amount_key" ON "Subscription"("userId", "cardId", "merchant", "amount");

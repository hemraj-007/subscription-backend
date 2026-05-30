-- CreateIndex
CREATE UNIQUE INDEX "Transaction_cardId_merchant_amount_date_key" ON "Transaction"("cardId", "merchant", "amount", "date");

-- CreateIndex
CREATE INDEX "Transaction_cardId_merchant_date_idx" ON "Transaction"("cardId", "merchant", "date");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_cardId_merchant_idx" ON "Subscription"("cardId", "merchant");

-- CreateIndex
CREATE INDEX "Alert_userId_type_scheduledAt_idx" ON "Alert"("userId", "type", "scheduledAt");

-- CreateIndex
CREATE INDEX "Alert_userId_type_idx" ON "Alert"("userId", "type");

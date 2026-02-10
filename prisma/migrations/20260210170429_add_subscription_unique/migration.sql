/*
  Warnings:

  - A unique constraint covering the columns `[userId,merchant,amount]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_merchant_amount_key" ON "Subscription"("userId", "merchant", "amount");

import { prisma } from "../../config/prisma";
import { detectSubscriptionGroups } from "./subscription.detector";
import { normalizeMerchant } from "./merchant.normalizer";

const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;

export const subscriptionService = {
  async detectAndSave(userId: string) {
    const groups = await detectSubscriptionGroups(userId);
    const created = [];

    for (const group of groups) {
      const lastCharged = group.dates[group.dates.length - 1];
      const nextCharge = new Date(lastCharged.getTime() + ONE_MONTH);
      const existingSubscriptions = await prisma.subscription.findMany({
        where: {
          userId,
          amount: group.amount,
        },
      });
      const matchingSubscription =
        existingSubscriptions.find((sub) => sub.merchant === group.merchant) ??
        existingSubscriptions.find((sub) => normalizeMerchant(sub.merchant) === group.merchant);

      if (matchingSubscription) {
        const subscription = await prisma.subscription.update({
          where: { id: matchingSubscription.id },
          data: {
            cardId: group.cardId,
            merchant: group.merchant,
            lastCharged,
            nextCharge,
          },
        });

        created.push(subscription);
        continue;
      }

      const subscription = await prisma.subscription.upsert({
        where: {
          userId_merchant_amount: {
            userId,
            merchant: group.merchant,
            amount: group.amount,
          },
        },
        update: {
          lastCharged,
          nextCharge,
        },
        create: {
          userId,
          cardId: group.cardId,
          merchant: group.merchant,
          amount: group.amount,
          frequency: "MONTHLY",
          lastCharged,
          nextCharge,
        },
      });

      created.push(subscription);
    }

    return created;
  },

  async list(userId: string) {
    return prisma.subscription.findMany({
      where: { userId },
      orderBy: [
        { nextCharge: { sort: "asc", nulls: "last" } },
        { lastCharged: "desc" },
      ],
    });
  },
};
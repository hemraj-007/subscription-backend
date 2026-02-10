import { prisma } from "../../config/prisma";
import { detectSubscriptionGroups } from "./subscription.detector";

const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;

export const subscriptionService = {
  async detectAndSave(userId: string) {
    const groups = await detectSubscriptionGroups(userId);
    const created = [];

    for (const group of groups) {
      const lastCharged = group.dates[group.dates.length - 1];

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
        },
        create: {
          userId,
          cardId: group.cardId,
          merchant: group.merchant,
          amount: group.amount,
          frequency: "MONTHLY",
          lastCharged,
          nextCharge: new Date(lastCharged.getTime() + ONE_MONTH),
        },
      });

      created.push(subscription);
    }

    return created;
  },

  async list(userId: string) {
    return prisma.subscription.findMany({
      where: { userId },
      orderBy: { nextCharge: "asc" },
    });
  },
};
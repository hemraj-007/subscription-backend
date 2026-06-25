import { prisma } from "../../config/prisma";
import { detectSubscriptionGroups } from "./subscription.detector";
import { buildSubscriptionSummary } from "./subscription.summary";

const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;

export const subscriptionService = {
  async detectAndSave(userId: string) {
    const groups = await detectSubscriptionGroups(userId);
    const created = [];

    for (const group of groups) {
      const lastCharged = group.dates[group.dates.length - 1];

      const subscription = await prisma.subscription.upsert({
        where: {
          userId_cardId_merchant_amount: {
            userId,
            cardId: group.cardId,
            merchant: group.merchant,
            amount: group.amount,
          },
        },
        update: {
          lastCharged,
          nextCharge: new Date(lastCharged.getTime() + ONE_MONTH),
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

  async list(userId: string, cardIds?: string[]) {
    return prisma.subscription.findMany({
      where: {
        userId,
        ...(cardIds?.length ? { cardId: { in: cardIds } } : {}),
      },
      orderBy: [
        { nextCharge: { sort: "asc", nulls: "last" } },
        { lastCharged: "desc" },
      ],
      include: {
        card: { select: { id: true, last4: true, bankName: true, network: true } },
      },
    });
  },

  async getSummary(userId: string, cardIds?: string[]) {
    const subs = await prisma.subscription.findMany({
      where: {
        userId,
        ...(cardIds?.length ? { cardId: { in: cardIds } } : {}),
      },
      orderBy: { nextCharge: "asc" },
    });
    return buildSubscriptionSummary(subs);
  },
};
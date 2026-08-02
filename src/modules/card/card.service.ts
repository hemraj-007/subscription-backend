import { prisma } from "../../config/prisma";
import { planService } from "../plan/plan.service";
import { alertsToDeleteAfterCardRemoval } from "../alert/alert.messages";

export const cardService = {
  async createCard(userId: string, data: {
    last4: string;
    bankName?: string;
    network?: string;
  }) {
    await planService.assertCanAddCard(userId);

    return prisma.creditCard.create({
      data: {
        userId,
        last4: data.last4,
        bankName: data.bankName,
        network: data.network,
      },
    });
  },

  async getCards(userId: string) {
    return prisma.creditCard.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Returns the card only if it belongs to the user; null otherwise. */
  async getCardForUser(userId: string, cardId: string) {
    return prisma.creditCard.findFirst({
      where: { id: cardId, userId },
    });
  },

  async deleteCard(userId: string, cardId: string) {
    // Only delete a card the user actually owns.
    const card = await prisma.creditCard.findFirst({
      where: { id: cardId, userId },
      select: { id: true },
    });
    if (!card) return { count: 0 };

    // Transactions and subscriptions reference the card via required FKs, so
    // remove them first (atomically) before deleting the card itself.
    // Alerts have no card/subscription FK — delete only those that become
    // stale after this card's subscriptions are gone (otherwise orphans keep
    // showing ghost renewals and suppress later same-timestamp alerts).
    await prisma.$transaction(async (tx) => {
      const deletedSubs = await tx.subscription.findMany({
        where: { cardId, userId },
        select: { merchant: true, amount: true, nextCharge: true },
      });

      await tx.subscription.deleteMany({ where: { cardId, userId } });
      await tx.transaction.deleteMany({ where: { cardId } });
      await tx.creditCard.delete({ where: { id: cardId } });

      if (deletedSubs.length === 0) return;

      const merchants = Array.from(
        new Set(deletedSubs.map((sub) => sub.merchant))
      );
      const remainingSubs = await tx.subscription.findMany({
        where: { userId, merchant: { in: merchants } },
        select: {
          merchant: true,
          amount: true,
          nextCharge: true,
          status: true,
        },
      });

      const staleAlerts = alertsToDeleteAfterCardRemoval(
        deletedSubs,
        remainingSubs
      );

      for (const alert of staleAlerts) {
        await tx.alert.deleteMany({
          where: {
            userId,
            type: alert.type,
            message: alert.message,
            ...(alert.scheduledAt ? { scheduledAt: alert.scheduledAt } : {}),
          },
        });
      }
    });

    return { count: 1 };
  },

  /** Keeps only card IDs that belong to this user (ignores unknown IDs). */
  async filterOwnedCardIds(userId: string, cardIds: string[]): Promise<string[]> {
    if (cardIds.length === 0) return [];
    const owned = await prisma.creditCard.findMany({
      where: { userId, id: { in: cardIds } },
      select: { id: true },
    });
    return owned.map((c) => c.id);
  },
};

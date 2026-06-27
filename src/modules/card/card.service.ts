import { prisma } from "../../config/prisma";

export const cardService = {
  async createCard(userId: string, data: {
    last4: string;
    bankName?: string;
    network?: string;
  }) {
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
    await prisma.$transaction([
      prisma.subscription.deleteMany({ where: { cardId, userId } }),
      prisma.transaction.deleteMany({ where: { cardId } }),
      prisma.creditCard.delete({ where: { id: cardId } }),
    ]);

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
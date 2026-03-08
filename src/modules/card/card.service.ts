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
    return prisma.creditCard.deleteMany({
      where: {
        id: cardId,
        userId,
      },
    });
  },
};
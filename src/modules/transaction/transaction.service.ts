import { prisma } from "../../config/prisma";
import { ParsedTransaction } from "./transaction.parser";

export const transactionService = {
  async saveTransactions(cardId: string, data: ParsedTransaction[]) {
    return prisma.transaction.createMany({
      data: data.map(tx => ({
        cardId,
        merchant: tx.merchant,
        amount: tx.amount,
        date: tx.date,
      })),
    });
  },

  async getTransactions(userId: string) {
    return prisma.transaction.findMany({
      where: {
        card: { userId },
      },
      orderBy: { date: "desc" },
    });
  },
};
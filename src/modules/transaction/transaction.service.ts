import { prisma } from "../../config/prisma";
import { ParsedTransaction } from "./transaction.types";

export const transactionService = {
  async saveTransactions(cardId: string, data: ParsedTransaction[]) {
    const result = await prisma.transaction.createMany({
      data: data.map(tx => ({
        cardId,
        merchant: tx.merchant,
        amount: tx.amount,
        date: tx.date,
      })),
    });
    return {
      inserted: result.count,
      skipped: 0,
    };
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
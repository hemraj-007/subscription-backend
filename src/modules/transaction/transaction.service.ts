import { prisma } from "../../config/prisma";
import { ParsedTransaction } from "./transaction.types";

export const transactionService = {
  async saveTransactions(cardId: string, data: ParsedTransaction[]) {
    const result = await prisma.transaction.createMany({
      data: data.map(tx => ({
        cardId,
        merchant: tx.merchant,
        amount: tx.amount,
        type: tx.type,
        date: tx.date,
      })),
      skipDuplicates: true,
    });
    return {
      inserted: result.count,
      skipped: Math.max(data.length - result.count, 0),
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
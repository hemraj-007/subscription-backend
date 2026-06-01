import { prisma } from "../../config/prisma";
import { ParsedTransaction } from "./transaction.types";

type TransactionWithOccurrence = ParsedTransaction & { occurrence: number };

function occurrenceKey(tx: ParsedTransaction): string {
  return JSON.stringify([tx.merchant, tx.amount, tx.date.toISOString()]);
}

export function assignTransactionOccurrences(
  data: ParsedTransaction[]
): TransactionWithOccurrence[] {
  const counts = new Map<string, number>();

  return data.map((tx) => {
    const key = occurrenceKey(tx);
    const occurrence = (counts.get(key) ?? 0) + 1;
    counts.set(key, occurrence);

    return { ...tx, occurrence };
  });
}

export const transactionService = {
  async saveTransactions(cardId: string, data: ParsedTransaction[]) {
    const transactions = assignTransactionOccurrences(data);

    const result = await prisma.transaction.createMany({
      data: transactions.map(tx => ({
        cardId,
        merchant: tx.merchant,
        amount: tx.amount,
        date: tx.date,
        occurrence: tx.occurrence,
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
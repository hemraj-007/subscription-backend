import { prisma } from "../../config/prisma";

export type TransactionGroup = {
  merchant: string;
  amount: number;
  cardId: string;
  dates: Date[];
};

export async function detectSubscriptionGroups(userId: string) {
  const transactions = await prisma.transaction.findMany({
    where: {
      card: { userId },
    },
    orderBy: { date: "asc" },
  });

  const map = new Map<string, TransactionGroup>();

  for (const tx of transactions) {
    const key = `${tx.merchant}-${tx.amount}`;

    if (!map.has(key)) {
      map.set(key, {
        merchant: tx.merchant,
        amount: tx.amount,
        cardId: tx.cardId,
        dates: [],
      });
    }

    map.get(key)!.dates.push(tx.date);
  }

  return Array.from(map.values());
}
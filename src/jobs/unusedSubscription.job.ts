import { SubscriptionStatus, TransactionType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { normalizeMerchant } from "../modules/subscription/merchant.normalizer";

const INACTIVITY_DAYS = 30;

type RecentTransaction = {
  cardId: string;
  merchant: string;
  date: Date;
};

/**
 * Builds cardId:normalizedMerchant → latest debit date.
 * Subscriptions store normalized merchants; statement rows often do not.
 */
export function buildLastTxByCardMerchant(transactions: RecentTransaction[]) {
  const lastTxByCardMerchant = new Map<string, Date>();

  for (const transaction of transactions) {
    const key = `${transaction.cardId}:${normalizeMerchant(transaction.merchant)}`;
    const existing = lastTxByCardMerchant.get(key);
    if (!existing || transaction.date > existing) {
      lastTxByCardMerchant.set(key, transaction.date);
    }
  }

  return lastTxByCardMerchant;
}

export async function detectUnusedSubscriptions(userId?: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      ...(userId ? { userId } : {}),
    },
  });

  if (subscriptions.length === 0) return;

  const cardIds = Array.from(new Set(subscriptions.map((sub) => sub.cardId)));

  // Only recent DEBITs matter for "unused"; normalize merchants so raw
  // statement descriptions still match subscription.merchant values.
  const recentTransactions = await prisma.transaction.findMany({
    where: {
      cardId: { in: cardIds },
      type: TransactionType.DEBIT,
      date: { gte: cutoff },
    },
    select: {
      cardId: true,
      merchant: true,
      date: true,
    },
  });

  const lastTxByCardMerchant = buildLastTxByCardMerchant(recentTransactions);

  const existingUnusedAlerts = await prisma.alert.findMany({
    where: {
      userId: { in: Array.from(new Set(subscriptions.map((sub) => sub.userId))) },
      type: "UNUSED",
    },
    select: {
      userId: true,
      message: true,
    },
  });
  const existingUnusedAlertKeys = new Set(
    existingUnusedAlerts.map((a) => `${a.userId}:${a.message}`)
  );

  const atRiskIds: string[] = [];
  const alertsToCreate: { userId: string; type: "UNUSED"; message: string; scheduledAt: Date }[] = [];

  for (const sub of subscriptions) {
    const lastTxDate = lastTxByCardMerchant.get(`${sub.cardId}:${sub.merchant}`);
    if (!lastTxDate) {
      atRiskIds.push(sub.id);
      const message = `You haven't used ${sub.merchant} in ${INACTIVITY_DAYS} days`;
      const key = `${sub.userId}:${message}`;
      if (!existingUnusedAlertKeys.has(key)) {
        alertsToCreate.push({
          userId: sub.userId,
          type: "UNUSED",
          message,
          scheduledAt: new Date(),
        });
        existingUnusedAlertKeys.add(key);
      }
    }
  }

  // Status flip + alert insert must be atomic. Otherwise a failure after
  // updateMany leaves subscriptions AT_RISK; the next run only loads ACTIVE
  // rows, so UNUSED alerts are lost permanently.
  const ops = [];
  if (atRiskIds.length > 0) {
    ops.push(
      prisma.subscription.updateMany({
        where: {
          id: { in: atRiskIds },
          status: SubscriptionStatus.ACTIVE,
        },
        data: { status: SubscriptionStatus.AT_RISK },
      })
    );
  }
  if (alertsToCreate.length > 0) {
    ops.push(prisma.alert.createMany({ data: alertsToCreate }));
  }
  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }
}

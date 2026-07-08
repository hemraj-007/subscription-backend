import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { normalizeMerchant } from "../modules/subscription/merchant.normalizer";

const INACTIVITY_DAYS = 30;

type SubscriptionCandidate = {
  id: string;
  userId: string;
  cardId: string;
  merchant: string;
  status: SubscriptionStatus;
};

type RecentTransaction = {
  cardId: string;
  merchant: string;
  date: Date;
};

type UnusedAlertInput = {
  userId: string;
  type: "UNUSED";
  message: string;
  scheduledAt: Date;
};

function subscriptionKey(cardId: string, merchant: string) {
  return `${cardId}:${normalizeMerchant(merchant)}`;
}

export function planUnusedSubscriptionUpdates(
  subscriptions: SubscriptionCandidate[],
  recentTransactions: RecentTransaction[],
  existingUnusedAlertKeys: Set<string>,
  scheduledAt: Date
) {
  const freshTxByCardMerchant = new Map<string, Date>();
  for (const tx of recentTransactions) {
    const key = subscriptionKey(tx.cardId, tx.merchant);
    const existing = freshTxByCardMerchant.get(key);
    if (!existing || tx.date > existing) {
      freshTxByCardMerchant.set(key, tx.date);
    }
  }

  const atRiskIds: string[] = [];
  const activeIds: string[] = [];
  const alertsToCreate: UnusedAlertInput[] = [];

  for (const sub of subscriptions) {
    const lastTxDate = freshTxByCardMerchant.get(subscriptionKey(sub.cardId, sub.merchant));
    if (lastTxDate) {
      if (sub.status !== SubscriptionStatus.ACTIVE) {
        activeIds.push(sub.id);
      }
      continue;
    }

    if (sub.status !== SubscriptionStatus.ACTIVE) continue;

    atRiskIds.push(sub.id);
    const message = `You haven't used ${sub.merchant} in ${INACTIVITY_DAYS} days`;
    const key = `${sub.userId}:${message}`;
    if (!existingUnusedAlertKeys.has(key)) {
      alertsToCreate.push({
        userId: sub.userId,
        type: "UNUSED",
        message,
        scheduledAt,
      });
      existingUnusedAlertKeys.add(key);
    }
  }

  return { atRiskIds, activeIds, alertsToCreate };
}

export async function detectUnusedSubscriptions(userId?: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.AT_RISK] },
      ...(userId ? { userId } : {}),
    },
  });

  if (subscriptions.length === 0) return;

  const cardIds = Array.from(new Set(subscriptions.map((sub) => sub.cardId)));
  const recentTransactions = await prisma.transaction.findMany({
    where: {
      cardId: { in: cardIds },
      type: "DEBIT",
      date: { gte: cutoff },
    },
    select: {
      cardId: true,
      merchant: true,
      date: true,
    },
  });

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

  const { atRiskIds, activeIds, alertsToCreate } = planUnusedSubscriptionUpdates(
    subscriptions,
    recentTransactions,
    existingUnusedAlertKeys,
    new Date()
  );

  if (atRiskIds.length > 0) {
    await prisma.subscription.updateMany({
      where: {
        id: { in: atRiskIds },
        status: SubscriptionStatus.ACTIVE,
      },
      data: { status: SubscriptionStatus.AT_RISK },
    });
  }
  if (activeIds.length > 0) {
    await prisma.subscription.updateMany({
      where: {
        id: { in: activeIds },
        status: SubscriptionStatus.AT_RISK,
      },
      data: { status: SubscriptionStatus.ACTIVE },
    });
  }
  if (alertsToCreate.length > 0) {
    await prisma.alert.createMany({ data: alertsToCreate });
  }
}
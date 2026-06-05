import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { normalizeMerchant } from "../modules/subscription/merchant.normalizer";

const INACTIVITY_DAYS = 30;

type SubscriptionUsageCandidate = {
  id: string;
  userId: string;
  cardId: string;
  merchant: string;
};

type TransactionUsageCandidate = {
  cardId: string;
  merchant: string;
  date: Date;
};

export function findUnusedSubscriptionCandidates(
  subscriptions: SubscriptionUsageCandidate[],
  transactions: TransactionUsageCandidate[],
  cutoff: Date
) {
  const subscriptionMerchants = new Set(subscriptions.map((sub) => sub.merchant));
  const recentlyUsedKeys = new Set<string>();

  for (const tx of transactions) {
    if (tx.date < cutoff) continue;

    const merchant = normalizeMerchant(tx.merchant);
    if (subscriptionMerchants.has(merchant)) {
      recentlyUsedKeys.add(`${tx.cardId}:${merchant}`);
    }
  }

  return subscriptions.filter(
    (sub) => !recentlyUsedKeys.has(`${sub.cardId}:${sub.merchant}`)
  );
}

export async function detectUnusedSubscriptions() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);

  const subscriptions = await prisma.subscription.findMany({
    where: { status: SubscriptionStatus.ACTIVE },
  });

  if (subscriptions.length === 0) return;

  const cardIds = Array.from(new Set(subscriptions.map((sub) => sub.cardId)));

  const recentTransactions = await prisma.transaction.findMany({
    where: {
      cardId: { in: cardIds },
      date: { gte: cutoff },
    },
    select: {
      cardId: true,
      merchant: true,
      date: true,
    },
  });

  const unusedSubscriptions = findUnusedSubscriptionCandidates(
    subscriptions,
    recentTransactions,
    cutoff
  );

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

  for (const sub of unusedSubscriptions) {
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

  if (atRiskIds.length > 0) {
    await prisma.subscription.updateMany({
      where: {
        id: { in: atRiskIds },
        status: SubscriptionStatus.ACTIVE,
      },
      data: { status: SubscriptionStatus.AT_RISK },
    });
  }
  if (alertsToCreate.length > 0) {
    await prisma.alert.createMany({ data: alertsToCreate });
  }
}
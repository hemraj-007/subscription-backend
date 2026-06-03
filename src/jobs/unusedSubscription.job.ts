import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { normalizeMerchant } from "../modules/subscription/merchant.normalizer";

const INACTIVITY_DAYS = 30;

type TransactionMerchant = {
  cardId: string;
  merchant: string;
};

type ActiveSubscription = {
  id: string;
  userId: string;
  cardId: string;
  merchant: string;
};

type ExistingUnusedAlert = {
  userId: string;
  message: string;
};

type UnusedAlertCreate = {
  userId: string;
  type: "UNUSED";
  message: string;
  scheduledAt: Date;
};

export function buildNormalizedTransactionKeys(transactions: TransactionMerchant[]) {
  const keys = new Set<string>();

  for (const tx of transactions) {
    keys.add(`${tx.cardId}:${normalizeMerchant(tx.merchant)}`);
  }

  return keys;
}

export function collectUnusedSubscriptionChanges(
  subscriptions: ActiveSubscription[],
  recentTransactions: TransactionMerchant[],
  existingUnusedAlerts: ExistingUnusedAlert[],
  scheduledAt = new Date()
) {
  const recentTransactionKeys = buildNormalizedTransactionKeys(recentTransactions);
  const existingUnusedAlertKeys = new Set(
    existingUnusedAlerts.map((a) => `${a.userId}:${a.message}`)
  );

  const atRiskIds: string[] = [];
  const alertsToCreate: UnusedAlertCreate[] = [];

  for (const sub of subscriptions) {
    const hasRecentCharge = recentTransactionKeys.has(`${sub.cardId}:${sub.merchant}`);
    if (!hasRecentCharge) {
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
  }

  return { atRiskIds, alertsToCreate };
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
  const { atRiskIds, alertsToCreate } = collectUnusedSubscriptionChanges(
    subscriptions,
    recentTransactions,
    existingUnusedAlerts
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
  if (alertsToCreate.length > 0) {
    await prisma.alert.createMany({ data: alertsToCreate });
  }
}
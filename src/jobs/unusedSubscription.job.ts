import { SubscriptionStatus, TransactionType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { normalizeMerchant } from "../modules/subscription/merchant.normalizer";

const INACTIVITY_DAYS = 30;

type TransactionGroup = {
  cardId: string;
  merchant: string;
  _max: { date: Date | null };
};

export function buildLastTxByCardMerchant(txGroups: TransactionGroup[]) {
  const lastTxByCardMerchant = new Map<string, Date>();

  for (const row of txGroups) {
    if (!row._max.date) continue;

    const key = `${row.cardId}:${normalizeMerchant(row.merchant)}`;
    const existing = lastTxByCardMerchant.get(key);
    if (!existing || row._max.date > existing) {
      lastTxByCardMerchant.set(key, row._max.date);
    }
  }

  return lastTxByCardMerchant;
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

  const txGroups = await prisma.transaction.groupBy({
    by: ["cardId", "merchant"],
    where: {
      cardId: { in: cardIds },
      type: TransactionType.DEBIT,
    },
    _max: { date: true },
  });

  const lastTxByCardMerchant = buildLastTxByCardMerchant(txGroups);

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
  const recoveredIds: string[] = [];
  const alertsToCreate: { userId: string; type: "UNUSED"; message: string; scheduledAt: Date }[] = [];

  for (const sub of subscriptions) {
    const lastTxDate = lastTxByCardMerchant.get(`${sub.cardId}:${sub.merchant}`);
    if (lastTxDate && lastTxDate >= cutoff) {
      if (sub.status === SubscriptionStatus.AT_RISK) {
        recoveredIds.push(sub.id);
      }
      continue;
    }

    if (sub.status === SubscriptionStatus.ACTIVE) {
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

  if (atRiskIds.length > 0) {
    await prisma.subscription.updateMany({
      where: {
        id: { in: atRiskIds },
        status: SubscriptionStatus.ACTIVE,
      },
      data: { status: SubscriptionStatus.AT_RISK },
    });
  }
  if (recoveredIds.length > 0) {
    await prisma.subscription.updateMany({
      where: {
        id: { in: recoveredIds },
        status: SubscriptionStatus.AT_RISK,
      },
      data: { status: SubscriptionStatus.ACTIVE },
    });
  }
  if (alertsToCreate.length > 0) {
    await prisma.alert.createMany({ data: alertsToCreate });
  }
}
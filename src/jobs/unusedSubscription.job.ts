import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { buildSubscriptionActivityKey } from "./subscriptionActivityKey";

const INACTIVITY_DAYS = 30;

export async function detectUnusedSubscriptions() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);

  const subscriptions = await prisma.subscription.findMany({
    where: { status: SubscriptionStatus.ACTIVE },
  });

  if (subscriptions.length === 0) return;

  const cardIds = Array.from(new Set(subscriptions.map((sub) => sub.cardId)));
  const amounts = Array.from(new Set(subscriptions.map((sub) => sub.amount)));

  const txGroups = await prisma.transaction.groupBy({
    by: ["cardId", "merchant", "amount"],
    where: {
      cardId: { in: cardIds },
      amount: { in: amounts },
    },
    _max: { date: true },
  });

  const lastTxBySubscriptionKey = new Map<string, Date>();
  for (const row of txGroups) {
    if (row._max.date) {
      const key = buildSubscriptionActivityKey(row.cardId, row.merchant, row.amount);
      const existing = lastTxBySubscriptionKey.get(key);
      if (!existing || row._max.date > existing) {
        lastTxBySubscriptionKey.set(key, row._max.date);
      }
    }
  }

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
    const lastTxDate = lastTxBySubscriptionKey.get(
      buildSubscriptionActivityKey(sub.cardId, sub.merchant, sub.amount)
    );
    if (!lastTxDate || lastTxDate < cutoff) {
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
  if (alertsToCreate.length > 0) {
    await prisma.alert.createMany({ data: alertsToCreate });
  }
}
import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";

const INACTIVITY_DAYS = 30;

/**
 * Inactivity cutoff as a UTC calendar day (midnight). Statement parsers store
 * dates via Date.UTC(...), so comparing them to `now - 30d` with a leftover
 * clock time falsely marks month-old charges unused (e.g. May 1 00:00 UTC
 * vs cutoff May 1 15:00 UTC on the afternoon of day 30).
 */
export function inactivityCutoff(now = new Date()): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - INACTIVITY_DAYS
    )
  );
}

export async function detectUnusedSubscriptions(userId?: string) {
  const cutoff = inactivityCutoff();

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      ...(userId ? { userId } : {}),
    },
  });

  if (subscriptions.length === 0) return;

  const cardIds = Array.from(new Set(subscriptions.map((sub) => sub.cardId)));
  const merchants = Array.from(new Set(subscriptions.map((sub) => sub.merchant)));

  const txGroups = await prisma.transaction.groupBy({
    by: ["cardId", "merchant"],
    where: {
      cardId: { in: cardIds },
      merchant: { in: merchants },
    },
    _max: { date: true },
  });

  const lastTxByCardMerchant = new Map<string, Date>();
  for (const row of txGroups) {
    if (row._max.date) {
      lastTxByCardMerchant.set(`${row.cardId}:${row.merchant}`, row._max.date);
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
    const lastTxDate = lastTxByCardMerchant.get(`${sub.cardId}:${sub.merchant}`);
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
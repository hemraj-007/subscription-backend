import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";

const INACTIVITY_DAYS = 30;

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
  const merchants = Array.from(new Set(subscriptions.map((sub) => sub.merchant)));

  // Absence of a merchant charge is only meaningful when the card has *some*
  // recent activity in our dataset. Credit-card statements are usually for a
  // past billing period; uploading last month's PDF must not mark every
  // detected subscription unused simply because all charges are older than
  // INACTIVITY_DAYS relative to wall-clock now.
  const recentCardActivity = await prisma.transaction.groupBy({
    by: ["cardId"],
    where: {
      cardId: { in: cardIds },
      date: { gte: cutoff },
    },
    _count: { _all: true },
  });
  const cardsWithRecentData = new Set(
    recentCardActivity.map((row) => row.cardId)
  );

  if (cardsWithRecentData.size === 0) return;

  const txGroups = await prisma.transaction.groupBy({
    by: ["cardId", "merchant"],
    where: {
      cardId: { in: Array.from(cardsWithRecentData) },
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
    if (!cardsWithRecentData.has(sub.cardId)) continue;

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
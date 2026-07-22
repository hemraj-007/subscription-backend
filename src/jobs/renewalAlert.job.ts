import { prisma } from "../config/prisma";

type RenewalAlertIdentity = {
  userId: string;
  message: string;
  scheduledAt: Date;
};

export function renewalAlertKey(alert: RenewalAlertIdentity): string {
  return JSON.stringify([
    alert.userId,
    alert.scheduledAt.toISOString(),
    alert.message,
  ]);
}

export async function generateRenewalAlerts(userId?: string) {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      nextCharge: { not: null },
      ...(userId ? { userId } : {}),
    },
  });

  if (subscriptions.length === 0) return;

  const userIds = Array.from(new Set(subscriptions.map((sub) => sub.userId)));
  const minScheduledAt = subscriptions.reduce(
    (min, sub) => (sub.nextCharge! < min ? sub.nextCharge! : min),
    subscriptions[0]!.nextCharge!
  );
  const maxScheduledAt = subscriptions.reduce(
    (max, sub) => (sub.nextCharge! > max ? sub.nextCharge! : max),
    subscriptions[0]!.nextCharge!
  );

  const existingAlerts = await prisma.alert.findMany({
    where: {
      userId: { in: userIds },
      type: "RENEWAL",
      scheduledAt: {
        gte: minScheduledAt,
        lte: maxScheduledAt,
      },
    },
    select: {
      userId: true,
      message: true,
      scheduledAt: true,
    },
  });

  const existingKeys = new Set(
    existingAlerts.map(renewalAlertKey)
  );
  const alertsToCreate = subscriptions
    .map((sub) => ({
      userId: sub.userId,
      type: "RENEWAL" as const,
      message: `${sub.merchant} will charge ₹${sub.amount} soon`,
      scheduledAt: sub.nextCharge!,
    }))
    .filter((alert) => {
      const key = renewalAlertKey(alert);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });

  if (alertsToCreate.length === 0) return;
  await prisma.alert.createMany({ data: alertsToCreate });
}
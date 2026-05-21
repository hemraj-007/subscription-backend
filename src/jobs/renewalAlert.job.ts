import { prisma } from "../config/prisma";

export async function generateRenewalAlerts() {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      nextCharge: { not: null },
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
      scheduledAt: true,
    },
  });

  const existingKeys = new Set(
    existingAlerts.map((alert) => `${alert.userId}:${alert.scheduledAt.toISOString()}`)
  );
  const alertsToCreate = subscriptions
    .filter((sub) => {
      const key = `${sub.userId}:${sub.nextCharge!.toISOString()}`;
      return !existingKeys.has(key);
    })
    .map((sub) => ({
      userId: sub.userId,
      type: "RENEWAL" as const,
      message: `${sub.merchant} will charge ₹${sub.amount} soon`,
      scheduledAt: sub.nextCharge!,
    }));

  if (alertsToCreate.length === 0) return;
  await prisma.alert.createMany({ data: alertsToCreate });
}
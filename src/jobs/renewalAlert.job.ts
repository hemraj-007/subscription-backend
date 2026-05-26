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
      message: true,
      scheduledAt: true,
    },
  });

  const existingKeys = new Set(
    existingAlerts.map(
      (alert) => `${alert.userId}:${alert.scheduledAt.toISOString()}:${alert.message}`
    )
  );
  const alertsToCreate: {
    userId: string;
    type: "RENEWAL";
    message: string;
    scheduledAt: Date;
  }[] = [];

  for (const sub of subscriptions) {
    const message = `${sub.merchant} will charge ₹${sub.amount} soon`;
    const key = `${sub.userId}:${sub.nextCharge!.toISOString()}:${message}`;
    if (existingKeys.has(key)) continue;

    alertsToCreate.push({
      userId: sub.userId,
      type: "RENEWAL",
      message,
      scheduledAt: sub.nextCharge!,
    });
    existingKeys.add(key);
  }

  if (alertsToCreate.length === 0) return;
  await prisma.alert.createMany({ data: alertsToCreate });
}
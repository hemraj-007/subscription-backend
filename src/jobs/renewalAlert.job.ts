import { prisma } from "../config/prisma";

const ALERT_WINDOW_DAYS = 60;

export async function generateRenewalAlerts() {
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + ALERT_WINDOW_DAYS);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      nextCharge: {
        not: null,
        lte: windowEnd,
      },
    },
  });

  for (const sub of subscriptions) {
    if (!sub.nextCharge) continue;

    const exists = await prisma.alert.findFirst({
      where: {
        userId: sub.userId,
        type: "RENEWAL",
        scheduledAt: sub.nextCharge,
      },
    });

    if (exists) continue;

    await prisma.alert.create({
      data: {
        userId: sub.userId,
        type: "RENEWAL",
        message: `${sub.merchant} will charge ₹${sub.amount} soon`,
        scheduledAt: sub.nextCharge,
      },
    });
  }
}
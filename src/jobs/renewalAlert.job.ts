import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";

const ALERT_WINDOW_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function generateRenewalAlerts() {
  const now = new Date();
  const alertWindowEnd = new Date(now.getTime() + ALERT_WINDOW_DAYS * DAY_MS);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      nextCharge: {
        not: null,
        gte: now,
        lte: alertWindowEnd,
      },
    },
  });

  for (const sub of subscriptions) {
    if (!sub.nextCharge) continue;

    const message = `${sub.merchant} will charge ₹${sub.amount} soon`;
    const exists = await prisma.alert.findFirst({
      where: {
        userId: sub.userId,
        type: "RENEWAL",
        message,
        scheduledAt: sub.nextCharge,
      },
    });

    if (exists) continue;

    await prisma.alert.create({
      data: {
        userId: sub.userId,
        type: "RENEWAL",
        message,
        scheduledAt: sub.nextCharge,
      },
    });
  }
}
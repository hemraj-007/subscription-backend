import { prisma } from "../config/prisma";
import { SubscriptionStatus } from "@prisma/client";

const ALERT_WINDOW_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function generateRenewalAlerts() {
  const alertWindowEnd = new Date(Date.now() + ALERT_WINDOW_DAYS * MS_PER_DAY);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      nextCharge: {
        not: null,
        lte: alertWindowEnd,
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

    if (exists) continue; // 🚫 already created

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
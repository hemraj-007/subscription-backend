import { prisma } from "../config/prisma";

const ALERT_WINDOW_DAYS = 60;

export async function generateRenewalAlerts() {
  const alertCutoff = new Date();
  alertCutoff.setDate(alertCutoff.getDate() + ALERT_WINDOW_DAYS);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      nextCharge: {
        not: null,
        lte: alertCutoff,
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
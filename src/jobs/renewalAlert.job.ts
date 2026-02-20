import { prisma } from "../config/prisma";

const ALERT_WINDOW_DAYS = 60;

export async function generateRenewalAlerts() {
  const subscriptions = await prisma.subscription.findMany({
    where: { status: "ACTIVE" },
  });

  for (const sub of subscriptions) {
    const exists = await prisma.alert.findFirst({
      where: {
        userId: sub.userId,
        type: "RENEWAL",
        scheduledAt: sub.nextCharge!,
      },
    });

    if (exists) continue; // 🚫 already created

    await prisma.alert.create({
      data: {
        userId: sub.userId,
        type: "RENEWAL",
        message: `${sub.merchant} will charge ₹${sub.amount} soon`,
        scheduledAt: sub.nextCharge!,
      },
    });
  }
}
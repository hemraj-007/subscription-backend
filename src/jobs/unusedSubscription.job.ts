import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";

const INACTIVITY_DAYS = 30;

export async function detectUnusedSubscriptions() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);

  const subscriptions = await prisma.subscription.findMany({
    where: { status: SubscriptionStatus.ACTIVE },
  });

  for (const sub of subscriptions) {
    const lastTx = await prisma.transaction.findFirst({
      where: {
        cardId: sub.cardId,
        merchant: sub.merchant,
      },
      orderBy: { date: "desc" },
    });

    if (!lastTx || lastTx.date < cutoff) {
      // already marked at risk? skip
      if (sub.status === SubscriptionStatus.AT_RISK) continue;

      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.AT_RISK },
      });

      const exists = await prisma.alert.findFirst({
        where: {
          userId: sub.userId,
          type: "UNUSED",
          message: `You haven't used ${sub.merchant} in ${INACTIVITY_DAYS} days`,
        },
      });

      if (exists) continue;

      await prisma.alert.create({
        data: {
          userId: sub.userId,
          type: "UNUSED",
          message: `You haven't used ${sub.merchant} in ${INACTIVITY_DAYS} days`,
          scheduledAt: new Date(),
        },
      });
    }
  }
}
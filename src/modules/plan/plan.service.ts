import { Plan, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { PLAN_LIMITS, PRO_FEATURES } from "./plan.constants";
import { PlanLimitError } from "./plan.errors";

type PlanDbClient = Pick<Prisma.TransactionClient, "user" | "creditCard">;

const safeUserSelect = {
  id: true,
  email: true,
  plan: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const planService = {
  isPro(plan: Plan) {
    return plan === Plan.PRO;
  },

  getLimits(plan: Plan) {
    return PLAN_LIMITS[plan];
  },

  async getUserPlan(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user) throw new Error("User not found");
    return user.plan;
  },

  async getPlanStatus(userId: string, db: PlanDbClient = prisma) {
    const [user, cardCount] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: safeUserSelect,
      }),
      db.creditCard.count({ where: { userId } }),
    ]);

    if (!user) throw new Error("User not found");

    const limits = PLAN_LIMITS[user.plan];
    const maxCards = limits.maxCards;
    const canAddCard = maxCards === null || cardCount < maxCards;

    return {
      user,
      plan: user.plan,
      isPro: user.plan === Plan.PRO,
      limits: {
        maxCards,
        aiInsights: limits.aiInsights,
        priceMonthlyUsd: limits.priceMonthlyUsd,
      },
      usage: {
        cardCount,
      },
      canAddCard,
      features: PRO_FEATURES,
    };
  },

  async assertCanAddCard(userId: string, db: PlanDbClient = prisma) {
    const status = await this.getPlanStatus(userId, db);
    if (!status.canAddCard) {
      throw new PlanLimitError(
        "Free plan allows 1 card. Upgrade to Pro for unlimited cards.",
        "cards"
      );
    }
    return status;
  },

  async assertPro(userId: string) {
    const plan = await this.getUserPlan(userId);
    if (plan !== Plan.PRO) {
      throw new PlanLimitError(
        "AI Insights is a Pro feature. Upgrade to unlock personalized recommendations.",
        "ai_insights"
      );
    }
    return plan;
  },

  /** Dev/stub upgrade — real payment provider hooks in here later. */
  async upgradeToPro(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user) throw new Error("User not found");
    if (user.plan === Plan.PRO) {
      return this.getPlanStatus(userId);
    }

    if (!env.BILLING_DEV_MODE) {
      const err = new Error("Payment integration coming soon. Contact support to upgrade.");
      (err as Error & { status?: number; code?: string }).status = 501;
      (err as Error & { code?: string }).code = "PAYMENT_NOT_CONFIGURED";
      throw err;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { plan: Plan.PRO },
    });

    return this.getPlanStatus(userId);
  },
};

import { Plan } from "@prisma/client";

export const PLAN_LIMITS = {
  [Plan.FREE]: {
    maxCards: 1,
    aiInsights: false,
    priceMonthlyUsd: 0,
  },
  [Plan.PRO]: {
    maxCards: null as number | null,
    aiInsights: true,
    priceMonthlyUsd: 2,
  },
} as const;

export const PRO_FEATURES = [
  "Unlimited cards",
  "AI-powered spending insights",
  "Priority renewal alerts",
  "Advanced analytics",
] as const;

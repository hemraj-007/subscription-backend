import { Subscription, SubscriptionStatus } from "@prisma/client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type UpcomingRenewal = {
  id: string;
  cardId: string;
  merchant: string;
  amount: number;
  nextCharge: string;
  status: SubscriptionStatus;
};

export type SubscriptionSummary = {
  currency: "INR";
  monthlyTotal: number;
  activeCount: number;
  headline: string;
  upcoming: {
    next7Days: UpcomingRenewal[];
    next30Days: UpcomingRenewal[];
  };
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function monthlyEquivalent(amount: number, frequency: string): number {
  const f = frequency.toUpperCase();
  if (f === "YEARLY") return amount / 12;
  if (f === "WEEKLY") return amount * (52 / 12);
  return amount;
}

function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function toRenewal(sub: Subscription): UpcomingRenewal {
  return {
    id: sub.id,
    cardId: sub.cardId,
    merchant: sub.merchant,
    amount: sub.amount,
    nextCharge: sub.nextCharge!.toISOString(),
    status: sub.status,
  };
}

function upcomingInWindow(
  subs: Subscription[],
  windowStart: Date,
  windowEnd: Date
): UpcomingRenewal[] {
  return subs
    .filter((s) => {
      if (s.status === "CANCELED" || !s.nextCharge) return false;
      const chargeDay = startOfDay(s.nextCharge);
      return chargeDay >= windowStart && chargeDay <= windowEnd;
    })
    .sort((a, b) => a.nextCharge!.getTime() - b.nextCharge!.getTime())
    .map(toRenewal);
}

export function buildSubscriptionSummary(subs: Subscription[]): SubscriptionSummary {
  const activeSubs = subs.filter((s) => s.status === "ACTIVE");
  const monthlyTotal = activeSubs.reduce(
    (sum, s) => sum + monthlyEquivalent(s.amount, s.frequency),
    0
  );
  const activeCount = activeSubs.length;

  const now = startOfDay(new Date());
  const end7 = new Date(now.getTime() + 7 * MS_PER_DAY);
  const end30 = new Date(now.getTime() + 30 * MS_PER_DAY);

  const headline =
    activeCount === 0
      ? "No active subscriptions yet — upload a statement and detect subscriptions."
      : `You're paying ${formatInr(monthlyTotal)}/month across ${activeCount} subscription${activeCount === 1 ? "" : "s"}`;

  return {
    currency: "INR",
    monthlyTotal,
    activeCount,
    headline,
    upcoming: {
      next7Days: upcomingInWindow(subs, now, end7),
      next30Days: upcomingInWindow(subs, now, end30),
    },
  };
}

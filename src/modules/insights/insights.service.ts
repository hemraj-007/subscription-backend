import { prisma } from "../../config/prisma";

export type InsightType = "warning" | "tip" | "savings" | "trend";

export type Insight = {
  id: string;
  type: InsightType;
  title: string;
  body: string;
  priority: number;
  actionLabel?: string;
  actionHref?: string;
};


function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export const insightsService = {
  async generateInsights(userId: string): Promise<Insight[]> {
    const [subscriptions, alerts, transactions] = await Promise.all([
      prisma.subscription.findMany({
        where: { userId },
        include: { card: { select: { last4: true, bankName: true } } },
        orderBy: { amount: "desc" },
      }),
      prisma.alert.findMany({
        where: { userId },
        orderBy: { scheduledAt: "desc" },
        take: 20,
      }),
      prisma.transaction.findMany({
        where: { card: { userId }, type: "DEBIT" },
        orderBy: { date: "desc" },
        take: 200,
      }),
    ]);

    const insights: Insight[] = [];
    const active = subscriptions.filter((s) => s.status === "ACTIVE");
    const atRisk = subscriptions.filter((s) => s.status === "AT_RISK");
    const monthlyTotal = active.reduce((sum, s) => sum + Number(s.amount), 0);

    if (active.length > 0) {
      insights.push({
        id: "monthly-burn",
        type: "trend",
        title: "Monthly subscription burn",
        body: `You're paying ${formatInr(monthlyTotal)} across ${active.length} active subscription${active.length === 1 ? "" : "s"} per billing cycle.`,
        priority: 50,
        actionLabel: "View subscriptions",
        actionHref: "/dashboard/subscriptions",
      });
    }

    const unusedAlerts = alerts.filter((a) => a.type === "UNUSED");
    if (unusedAlerts.length > 0) {
      const potentialSavings = unusedAlerts.reduce((sum, a) => {
        const sub = subscriptions.find((s) => a.message.includes(s.merchant));
        return sum + (sub ? Number(sub.amount) : 0);
      }, 0);
      insights.push({
        id: "unused-subs",
        type: "savings",
        title: `${unusedAlerts.length} possibly unused subscription${unusedAlerts.length === 1 ? "" : "s"}`,
        body:
          potentialSavings > 0
            ? `Review subscriptions you haven't used recently — you could save up to ${formatInr(potentialSavings)}/month.`
            : "We flagged subscriptions with no recent activity. Review them to avoid paying for services you don't use.",
        priority: 90,
        actionLabel: "Review alerts",
        actionHref: "/dashboard/alerts",
      });
    }

    if (atRisk.length > 0) {
      const atRiskTotal = atRisk.reduce((sum, s) => sum + Number(s.amount), 0);
      insights.push({
        id: "at-risk",
        type: "warning",
        title: `${atRisk.length} subscription${atRisk.length === 1 ? "" : "s"} at risk`,
        body: `${formatInr(atRiskTotal)} in charges may be irregular or increasing. Check for price hikes or duplicate plans.`,
        priority: 85,
        actionLabel: "View subscriptions",
        actionHref: "/dashboard/subscriptions",
      });
    }

    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    const upcoming = active.filter(
      (s) => s.nextCharge && new Date(s.nextCharge) <= in7Days && new Date(s.nextCharge) >= now
    );
    if (upcoming.length > 0) {
      const upcomingTotal = upcoming.reduce((sum, s) => sum + Number(s.amount), 0);
      const merchants = upcoming
        .slice(0, 3)
        .map((s) => s.merchant)
        .join(", ");
      insights.push({
        id: "renewals-soon",
        type: "warning",
        title: `${upcoming.length} renewal${upcoming.length === 1 ? "" : "s"} this week`,
        body: `${formatInr(upcomingTotal)} due soon (${merchants}${upcoming.length > 3 ? "…" : ""}).`,
        priority: 80,
        actionLabel: "View renewals",
        actionHref: "/dashboard/renewals",
      });
    }

    const topSub = active[0];
    if (topSub && Number(topSub.amount) > 0 && monthlyTotal > 0) {
      const pct = Math.round((Number(topSub.amount) / monthlyTotal) * 100);
      if (pct >= 30) {
        insights.push({
          id: "top-spender",
          type: "tip",
          title: `${topSub.merchant} is your biggest sub`,
          body: `It accounts for ${pct}% of your monthly subscription spend (${formatInr(Number(topSub.amount))}). Consider if you're getting full value.`,
          priority: 60,
          actionLabel: "View details",
          actionHref: `/dashboard/subscriptions/${topSub.id}`,
        });
      }
    }

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentTx = transactions.filter((t) => new Date(t.date) >= thirtyDaysAgo);
    const merchantSpend: Record<string, number> = {};
    for (const tx of recentTx) {
      const key = (tx.merchant || "Other").trim();
      merchantSpend[key] = (merchantSpend[key] ?? 0) + Number(tx.amount);
    }
    const topMerchants = Object.entries(merchantSpend)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (topMerchants.length > 0 && topMerchants[0]![1] > 0) {
      insights.push({
        id: "top-merchants",
        type: "trend",
        title: "Top spending this month",
        body: `Your highest charges: ${topMerchants.map(([m, a]) => `${m} (${formatInr(a)})`).join(", ")}.`,
        priority: 40,
        actionLabel: "View transactions",
        actionHref: "/dashboard/transactions",
      });
    }

    const multiCard = new Set(active.map((s) => s.cardId)).size;
    if (multiCard > 1) {
      insights.push({
        id: "multi-card",
        type: "tip",
        title: "Subscriptions spread across cards",
        body: `You have active subs on ${multiCard} cards. Consolidating billing can make renewals easier to track.`,
        priority: 35,
        actionLabel: "View cards",
        actionHref: "/dashboard/cards",
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: "get-started",
        type: "tip",
        title: "Add data to unlock insights",
        body: "Upload a statement and run subscription detection. We'll analyze your spending and surface savings opportunities.",
        priority: 10,
        actionLabel: "Upload statement",
        actionHref: "/dashboard/statements",
      });
    }

    return insights.sort((a, b) => b.priority - a.priority);
  },
};

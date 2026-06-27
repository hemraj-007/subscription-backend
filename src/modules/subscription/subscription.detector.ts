import { prisma } from "../../config/prisma";
import {
  isLikelySubscriptionCharge,
  normalizeMerchant,
} from "./merchant.normalizer";

export type TransactionGroup = {
  merchant: string;
  amount: number;
  cardId: string;
  dates: Date[];
  /** Original raw description (e.g. from statement); we display normalized merchant */
  rawMerchant?: string;
};

/** Minimum number of recurring charges to treat as a subscription (avoids one-off purchases). */
const MIN_RECURRING_COUNT = 2;

/** Min/max days between charges to consider "monthly" recurrence (handles 28–31 day billing). */
const MIN_DAYS_BETWEEN = 20;
const MAX_DAYS_BETWEEN = 45;

function hasRecurrenceSignal(dates: Date[]): boolean {
  if (dates.length < MIN_RECURRING_COUNT) return false;
  const sorted = [...dates].map((d) => d.getTime()).sort((a, b) => a - b);
  // Accept if any consecutive pair is ~monthly (strong subscription signal)
  for (let i = 1; i < sorted.length; i++) {
    const days = (sorted[i]! - sorted[i - 1]!) / (24 * 60 * 60 * 1000);
    if (days >= MIN_DAYS_BETWEEN && days <= MAX_DAYS_BETWEEN) return true;
  }
  // Or accept if 3+ same-amount charges (recurring even if spacing is irregular in export)
  return dates.length >= 3;
}

/**
 * Detects subscription-like charges from transactions (e.g. from real statements).
 * - Normalizes merchant names so "NETFLIX.COM 866..." and "Netflix" group together.
 * - Requires recurrence (2+ charges ~monthly apart), OR a single charge that
 *   clearly looks like a subscription (known merchant / subscription keywords).
 */
export async function detectSubscriptionGroups(userId: string) {
  const transactions = await prisma.transaction.findMany({
    where: {
      card: { userId },
      // Subscriptions are recurring charges (money out), never credits/refunds.
      type: "DEBIT",
    },
    orderBy: { date: "asc" },
  });

  const map = new Map<string, TransactionGroup>();

  for (const tx of transactions) {
    const normalized = normalizeMerchant(tx.merchant);
    const key = `${tx.cardId}-${normalized}-${tx.amount}`;

    if (!map.has(key)) {
      map.set(key, {
        merchant: normalized,
        amount: tx.amount,
        cardId: tx.cardId,
        dates: [],
        rawMerchant: tx.merchant,
      });
    }

    map.get(key)!.dates.push(tx.date);
  }

  return Array.from(map.values()).filter((group) => {
    if (hasRecurrenceSignal(group.dates)) return true;
    const description = group.rawMerchant ?? group.merchant;
    return (
      group.dates.length >= 1 && isLikelySubscriptionCharge(description)
    );
  });
}
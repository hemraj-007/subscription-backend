/** Keep unused-alert copy in sync with detectUnusedSubscriptions. */
export const UNUSED_INACTIVITY_DAYS = 30;

export function renewalAlertMessage(merchant: string, amount: number): string {
  return `${merchant} will charge ₹${amount} soon`;
}

export function unusedAlertMessage(merchant: string): string {
  return `You haven't used ${merchant} in ${UNUSED_INACTIVITY_DAYS} days`;
}

export type SubscriptionAlertSource = {
  merchant: string;
  amount: number;
  nextCharge: Date | null;
};

export type RemainingSubscription = SubscriptionAlertSource & {
  status: string;
};

export type AlertDeletion = {
  type: "RENEWAL" | "UNUSED";
  message: string;
  scheduledAt?: Date;
};

/**
 * Alerts that become stale after a card's subscriptions are removed.
 * Skips deletions still justified by subscriptions that remain on other cards.
 */
export function alertsToDeleteAfterCardRemoval(
  deletedSubs: SubscriptionAlertSource[],
  remainingSubs: RemainingSubscription[]
): AlertDeletion[] {
  const deletions: AlertDeletion[] = [];

  for (const sub of deletedSubs) {
    if (!sub.nextCharge) continue;
    const message = renewalAlertMessage(sub.merchant, sub.amount);
    const stillNeeded = remainingSubs.some(
      (remaining) =>
        remaining.status === "ACTIVE" &&
        remaining.merchant === sub.merchant &&
        remaining.amount === sub.amount &&
        remaining.nextCharge?.getTime() === sub.nextCharge!.getTime()
    );
    if (!stillNeeded) {
      deletions.push({
        type: "RENEWAL",
        message,
        scheduledAt: sub.nextCharge,
      });
    }
  }

  const deletedMerchants = new Set(deletedSubs.map((sub) => sub.merchant));
  for (const merchant of deletedMerchants) {
    const stillHasMerchant = remainingSubs.some(
      (remaining) => remaining.merchant === merchant
    );
    if (!stillHasMerchant) {
      deletions.push({
        type: "UNUSED",
        message: unusedAlertMessage(merchant),
      });
    }
  }

  return deletions;
}

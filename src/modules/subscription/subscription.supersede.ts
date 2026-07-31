import { TransactionGroup } from "./subscription.detector";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Minimum gap between a newer amount's last charge and an older amount's last
 * charge before we treat the older price as superseded (price hike / plan change).
 * Matches the detector's ~monthly recurrence lower bound.
 */
const SUPERSEDE_MIN_DAYS = 20;

function lastChargeTime(group: TransactionGroup): number {
  const last = group.dates[group.dates.length - 1];
  return last ? last.getTime() : 0;
}

export type PartitionedSubscriptionGroups = {
  /** Amounts that should remain / become the live subscription. */
  current: TransactionGroup[];
  /** Older amounts clearly replaced by a newer price for the same merchant+card. */
  superseded: TransactionGroup[];
};

/**
 * When the same merchant+card appears at multiple amounts, keep amounts that
 * still charged recently alongside the newest price (e.g. two Spotify plans),
 * but mark amounts whose last charge is ≥20 days before the newest as
 * superseded (typical price hike).
 */
export function partitionSubscriptionGroups(
  groups: TransactionGroup[]
): PartitionedSubscriptionGroups {
  const clusters = new Map<string, TransactionGroup[]>();

  for (const group of groups) {
    const key = `${group.cardId}\0${group.merchant}`;
    const list = clusters.get(key);
    if (list) list.push(group);
    else clusters.set(key, [group]);
  }

  const current: TransactionGroup[] = [];
  const superseded: TransactionGroup[] = [];

  for (const cluster of clusters.values()) {
    if (cluster.length === 1) {
      current.push(cluster[0]!);
      continue;
    }

    const ranked = [...cluster].sort(
      (a, b) => lastChargeTime(b) - lastChargeTime(a)
    );
    const newestLast = lastChargeTime(ranked[0]!);
    current.push(ranked[0]!);

    for (const older of ranked.slice(1)) {
      const gapDays = (newestLast - lastChargeTime(older)) / MS_PER_DAY;
      if (gapDays >= SUPERSEDE_MIN_DAYS) {
        superseded.push(older);
      } else {
        current.push(older);
      }
    }
  }

  return { current, superseded };
}

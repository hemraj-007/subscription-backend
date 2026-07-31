import { test } from "node:test";
import assert from "node:assert/strict";

import { TransactionGroup } from "./subscription.detector";
import { partitionSubscriptionGroups } from "./subscription.supersede";

function group(
  merchant: string,
  amount: number,
  daysAgoList: number[],
  cardId = "card-1"
): TransactionGroup {
  const now = Date.UTC(2026, 6, 31); // 2026-07-31
  const dates = daysAgoList
    .map((daysAgo) => new Date(now - daysAgo * 24 * 60 * 60 * 1000))
    .sort((a, b) => a.getTime() - b.getTime());
  return { merchant, amount, cardId, dates };
}

test("price hike: older amount is superseded when newest charge is ≥20 days later", () => {
  const oldPrice = group("Netflix", 649, [90, 60, 45]); // last charge 45 days ago
  const newPrice = group("Netflix", 699, [30, 0]); // charged today and 30 days ago
  const { current, superseded } = partitionSubscriptionGroups([oldPrice, newPrice]);

  assert.equal(current.length, 1);
  assert.equal(current[0]!.amount, 699);
  assert.equal(superseded.length, 1);
  assert.equal(superseded[0]!.amount, 649);
});

test("two recent plans at different amounts both stay current", () => {
  const individual = group("Spotify", 119, [28, 0]);
  const family = group("Spotify", 179, [14, 0]);
  const { current, superseded } = partitionSubscriptionGroups([
    individual,
    family,
  ]);

  assert.equal(superseded.length, 0);
  assert.equal(current.length, 2);
  const amounts = current.map((g) => g.amount).sort((a, b) => a - b);
  assert.deepEqual(amounts, [119, 179]);
});

test("single amount groups are always current", () => {
  const only = group("Notion", 800, [30, 0]);
  const { current, superseded } = partitionSubscriptionGroups([only]);
  assert.equal(current.length, 1);
  assert.equal(superseded.length, 0);
});

test("supersession is scoped per card", () => {
  const cardAOld = group("Netflix", 649, [60, 45], "card-a");
  const cardANew = group("Netflix", 699, [30, 0], "card-a");
  const cardBOld = group("Netflix", 649, [30, 0], "card-b");
  const { current, superseded } = partitionSubscriptionGroups([
    cardAOld,
    cardANew,
    cardBOld,
  ]);

  assert.equal(superseded.length, 1);
  assert.equal(superseded[0]!.cardId, "card-a");
  assert.equal(superseded[0]!.amount, 649);
  assert.ok(current.some((g) => g.cardId === "card-b" && g.amount === 649));
  assert.ok(current.some((g) => g.cardId === "card-a" && g.amount === 699));
});

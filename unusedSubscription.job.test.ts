import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNormalizedTransactionKeys,
  collectUnusedSubscriptionChanges,
} from "./src/jobs/unusedSubscription.job";

test("matches raw statement merchants to normalized subscription merchants", () => {
  const keys = buildNormalizedTransactionKeys([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
    },
  ]);

  assert.equal(keys.has("card-1:Netflix"), true);
});

test("keeps card ids isolated when building normalized transaction keys", () => {
  const keys = buildNormalizedTransactionKeys([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
    },
  ]);

  assert.equal(keys.has("card-2:Netflix"), false);
});

test("does not mark a normalized subscription at risk when a recent raw merchant charge exists", () => {
  const changes = collectUnusedSubscriptionChanges(
    [
      {
        id: "sub-1",
        userId: "user-1",
        cardId: "card-1",
        merchant: "Netflix",
      },
    ],
    [
      {
        cardId: "card-1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
      },
    ],
    []
  );

  assert.deepEqual(changes.atRiskIds, []);
  assert.deepEqual(changes.alertsToCreate, []);
});

test("marks a subscription at risk when no recent normalized merchant charge exists", () => {
  const scheduledAt = new Date("2026-06-03T00:00:00.000Z");
  const changes = collectUnusedSubscriptionChanges(
    [
      {
        id: "sub-1",
        userId: "user-1",
        cardId: "card-1",
        merchant: "Netflix",
      },
    ],
    [],
    [],
    scheduledAt
  );

  assert.deepEqual(changes.atRiskIds, ["sub-1"]);
  assert.deepEqual(changes.alertsToCreate, [
    {
      userId: "user-1",
      type: "UNUSED",
      message: "You haven't used Netflix in 30 days",
      scheduledAt,
    },
  ]);
});

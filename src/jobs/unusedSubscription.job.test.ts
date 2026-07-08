import { test } from "node:test";
import assert from "node:assert/strict";
import { SubscriptionStatus } from "@prisma/client";

import { planUnusedSubscriptionUpdates } from "./unusedSubscription.job";

const scheduledAt = new Date("2026-07-06T00:00:00.000Z");

test("unused detection matches raw transaction merchants through normalization", () => {
  const result = planUnusedSubscriptionUpdates(
    [
      {
        id: "active-netflix",
        userId: "user-1",
        cardId: "card-1",
        merchant: "Netflix",
        status: SubscriptionStatus.ACTIVE,
      },
      {
        id: "risk-spotify",
        userId: "user-1",
        cardId: "card-1",
        merchant: "Spotify",
        status: SubscriptionStatus.AT_RISK,
      },
    ],
    [
      {
        cardId: "card-1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
        date: scheduledAt,
      },
      {
        cardId: "card-1",
        merchant: "SPOTIFY USA",
        date: scheduledAt,
      },
    ],
    new Set(),
    scheduledAt
  );

  assert.deepEqual(result.atRiskIds, []);
  assert.deepEqual(result.activeIds, ["risk-spotify"]);
  assert.deepEqual(result.alertsToCreate, []);
});

test("unused detection only marks active subscriptions without fresh matches", () => {
  const result = planUnusedSubscriptionUpdates(
    [
      {
        id: "active-adobe",
        userId: "user-1",
        cardId: "card-1",
        merchant: "Adobe",
        status: SubscriptionStatus.ACTIVE,
      },
      {
        id: "risk-canva",
        userId: "user-1",
        cardId: "card-1",
        merchant: "Canva",
        status: SubscriptionStatus.AT_RISK,
      },
    ],
    [],
    new Set(),
    scheduledAt
  );

  assert.deepEqual(result.atRiskIds, ["active-adobe"]);
  assert.deepEqual(result.activeIds, []);
  assert.deepEqual(result.alertsToCreate, [
    {
      userId: "user-1",
      type: "UNUSED",
      message: "You haven't used Adobe in 30 days",
      scheduledAt,
    },
  ]);
});

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildLastTransactionBySubscriptionMerchant,
  subscriptionActivityKey,
} from "./unusedSubscription.job";

test("unused detection matches normalized subscription merchant to raw transaction text", () => {
  const lastCharged = new Date("2026-06-15T00:00:00.000Z");
  const activity = buildLastTransactionBySubscriptionMerchant([
    {
      cardId: "card_1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      date: lastCharged,
    },
  ]);

  assert.equal(
    activity.get(subscriptionActivityKey("card_1", "Netflix")),
    lastCharged
  );
});

test("unused detection keeps latest date across equivalent raw merchants", () => {
  const older = new Date("2026-06-01T00:00:00.000Z");
  const newer = new Date("2026-06-20T00:00:00.000Z");
  const activity = buildLastTransactionBySubscriptionMerchant([
    { cardId: "card_1", merchant: "Spotify *ABC123", date: older },
    { cardId: "card_1", merchant: "SPOTIFY PREMIUM", date: newer },
  ]);

  assert.equal(
    activity.get(subscriptionActivityKey("card_1", "Spotify")),
    newer
  );
});

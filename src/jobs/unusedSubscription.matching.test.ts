import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLastTxByNormalizedCardMerchant,
  normalizedCardMerchantKey,
} from "./unusedSubscription.matching";

test("matches normalized subscription merchant to raw statement descriptions", () => {
  const lastTxByMerchant = buildLastTxByNormalizedCardMerchant([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      _max: { date: new Date("2026-05-25T00:00:00.000Z") },
    },
  ]);

  assert.equal(
    lastTxByMerchant.get(normalizedCardMerchantKey("card-1", "Netflix"))?.toISOString(),
    "2026-05-25T00:00:00.000Z"
  );
});

test("keeps the newest date when multiple raw merchants normalize together", () => {
  const lastTxByMerchant = buildLastTxByNormalizedCardMerchant([
    {
      cardId: "card-1",
      merchant: "SPOTIFY 1234567890",
      _max: { date: new Date("2026-04-25T00:00:00.000Z") },
    },
    {
      cardId: "card-1",
      merchant: "Spotify USA",
      _max: { date: new Date("2026-05-25T00:00:00.000Z") },
    },
  ]);

  assert.equal(
    lastTxByMerchant.get(normalizedCardMerchantKey("card-1", "Spotify"))?.toISOString(),
    "2026-05-25T00:00:00.000Z"
  );
});

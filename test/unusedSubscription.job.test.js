const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  buildLastTransactionDateBySubscriptionMerchant,
} = require("../dist/jobs/unusedSubscription.job");

test("normalizes transaction merchants when building unused subscription lookup", () => {
  const lastTxByCardMerchant = buildLastTransactionDateBySubscriptionMerchant([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      _max: { date: new Date("2026-06-15T00:00:00.000Z") },
    },
  ]);

  assert.equal(
    lastTxByCardMerchant.get("card-1:Netflix")?.toISOString(),
    "2026-06-15T00:00:00.000Z"
  );
});

test("keeps newest transaction date across raw merchant variants", () => {
  const lastTxByCardMerchant = buildLastTransactionDateBySubscriptionMerchant([
    {
      cardId: "card-1",
      merchant: "Spotify 1234567890 NY",
      _max: { date: new Date("2026-05-10T00:00:00.000Z") },
    },
    {
      cardId: "card-1",
      merchant: "SPOTIFY USA",
      _max: { date: new Date("2026-06-18T00:00:00.000Z") },
    },
  ]);

  assert.equal(
    lastTxByCardMerchant.get("card-1:Spotify")?.toISOString(),
    "2026-06-18T00:00:00.000Z"
  );
});

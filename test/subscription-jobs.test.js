const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildLastTxByNormalizedMerchant,
} = require("../dist/jobs/unusedSubscription.job.js");
const {
  shouldReactivateSubscription,
} = require("../dist/modules/subscription/subscription.service.js");
const { SubscriptionStatus } = require("@prisma/client");

test("unused subscription matching normalizes raw transaction merchants", () => {
  const recentNetflixCharge = new Date("2026-06-10T00:00:00.000Z");
  const olderNetflixCharge = new Date("2026-05-10T00:00:00.000Z");

  const lastTxByCardMerchant = buildLastTxByNormalizedMerchant([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      _max: { date: recentNetflixCharge },
    },
    {
      cardId: "card-1",
      merchant: "Netflix",
      _max: { date: olderNetflixCharge },
    },
    {
      cardId: "card-1",
      merchant: "Spotify",
      _max: { date: null },
    },
  ]);

  assert.equal(
    lastTxByCardMerchant.get("card-1:Netflix"),
    recentNetflixCharge
  );
  assert.equal(lastTxByCardMerchant.has("card-1:NETFLIX.COM 866-716-0414 CA"), false);
  assert.equal(lastTxByCardMerchant.has("card-1:Spotify"), false);
});

test("only recently charged at-risk subscriptions are reactivated", () => {
  const now = new Date("2026-06-18T00:00:00.000Z");
  const recentCharge = new Date("2026-06-01T00:00:00.000Z");
  const staleCharge = new Date("2026-04-01T00:00:00.000Z");

  assert.equal(
    shouldReactivateSubscription(SubscriptionStatus.AT_RISK, recentCharge, now),
    true
  );
  assert.equal(
    shouldReactivateSubscription(SubscriptionStatus.AT_RISK, staleCharge, now),
    false
  );
  assert.equal(
    shouldReactivateSubscription(SubscriptionStatus.CANCELED, recentCharge, now),
    false
  );
});

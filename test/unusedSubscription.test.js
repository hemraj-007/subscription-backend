const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildLastTransactionDateBySubscriptionMerchant,
} = require("../dist/jobs/unusedSubscription.job.js");

test("matches normalized subscription merchants to raw statement transactions", () => {
  const olderNetflixCharge = new Date("2026-05-01T00:00:00.000Z");
  const latestNetflixCharge = new Date("2026-06-01T00:00:00.000Z");

  const lastChargeByMerchant = buildLastTransactionDateBySubscriptionMerchant([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      _max: { date: olderNetflixCharge },
    },
    {
      cardId: "card-1",
      merchant: "Netflix Streaming",
      _max: { date: latestNetflixCharge },
    },
  ]);

  assert.equal(
    lastChargeByMerchant.get("card-1:Netflix")?.toISOString(),
    latestNetflixCharge.toISOString()
  );
});

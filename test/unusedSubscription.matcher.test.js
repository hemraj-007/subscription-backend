const test = require("node:test");
const assert = require("node:assert/strict");

const {
  lastTransactionDatesByNormalizedMerchant,
  subscriptionActivityKey,
} = require("../dist/jobs/unusedSubscription.matcher");

test("aggregates last transaction dates by normalized merchant", () => {
  const oldNetflixCharge = new Date("2026-04-01T00:00:00.000Z");
  const latestNetflixCharge = new Date("2026-05-01T00:00:00.000Z");
  const spotifyCharge = new Date("2026-05-03T00:00:00.000Z");

  const lastTxByMerchant = lastTransactionDatesByNormalizedMerchant([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      _max: { date: oldNetflixCharge },
    },
    {
      cardId: "card-1",
      merchant: "Netflix monthly subscription",
      _max: { date: latestNetflixCharge },
    },
    {
      cardId: "card-1",
      merchant: "SPOTIFY USA",
      _max: { date: spotifyCharge },
    },
  ]);

  assert.equal(
    lastTxByMerchant.get(subscriptionActivityKey("card-1", "Netflix")),
    latestNetflixCharge
  );
  assert.equal(
    lastTxByMerchant.get(subscriptionActivityKey("card-1", "Spotify")),
    spotifyCharge
  );
});

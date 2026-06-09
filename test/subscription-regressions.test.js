const assert = require("node:assert/strict");
const test = require("node:test");

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://user:password@localhost:5432/subscription_guardian_test";

const {
  groupSubscriptionTransactions,
} = require("../dist/modules/subscription/subscription.detector");
const {
  buildLastTxByCardMerchant,
  subscriptionActivityKey,
} = require("../dist/jobs/unusedSubscription.job");

test("detects the same subscription independently on different cards", () => {
  const transactions = [
    {
      cardId: "card-a",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      amount: 649,
      date: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      cardId: "card-a",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      amount: 649,
      date: new Date("2026-02-01T00:00:00.000Z"),
    },
    {
      cardId: "card-b",
      merchant: "Netflix",
      amount: 649,
      date: new Date("2026-01-03T00:00:00.000Z"),
    },
    {
      cardId: "card-b",
      merchant: "Netflix",
      amount: 649,
      date: new Date("2026-02-03T00:00:00.000Z"),
    },
  ];

  const groups = groupSubscriptionTransactions(transactions);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => ({
      cardId: group.cardId,
      merchant: group.merchant,
      amount: group.amount,
      charges: group.dates.length,
    })),
    [
      { cardId: "card-a", merchant: "Netflix", amount: 649, charges: 2 },
      { cardId: "card-b", merchant: "Netflix", amount: 649, charges: 2 },
    ]
  );
});

test("unused subscription activity matches raw transaction descriptors by normalized merchant", () => {
  const recentCharge = new Date("2026-06-01T00:00:00.000Z");
  const lastTxByCardMerchant = buildLastTxByCardMerchant([
    {
      cardId: "card-a",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      date: recentCharge,
    },
  ]);

  assert.equal(
    lastTxByCardMerchant.get(subscriptionActivityKey("card-a", "Netflix")),
    recentCharge
  );
});

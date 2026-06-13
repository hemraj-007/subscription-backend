const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRecentTransactionMerchantKeys,
  isSubscriptionUnused,
} = require("../dist/jobs/unusedSubscription.job");

test("matches normalized subscription merchants to raw recent transactions", () => {
  const recentTransactions = buildRecentTransactionMerchantKeys([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
    },
  ]);

  assert.equal(
    isSubscriptionUnused(
      { cardId: "card-1", merchant: "Netflix" },
      recentTransactions
    ),
    false
  );
});

test("keeps card scoping when matching recent transaction merchants", () => {
  const recentTransactions = buildRecentTransactionMerchantKeys([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
    },
  ]);

  assert.equal(
    isSubscriptionUnused(
      { cardId: "card-2", merchant: "Netflix" },
      recentTransactions
    ),
    true
  );
});

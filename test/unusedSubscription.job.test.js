const assert = require("node:assert/strict");
const test = require("node:test");

const { prisma } = require("../dist/config/prisma.js");
const {
  buildLastTxByNormalizedMerchant,
  detectUnusedSubscriptions,
} = require("../dist/jobs/unusedSubscription.job.js");

test("buildLastTxByNormalizedMerchant keys raw transaction merchants by normalized name", () => {
  const recent = new Date("2026-06-15T00:00:00.000Z");
  const older = new Date("2026-05-15T00:00:00.000Z");

  const lastTransactions = buildLastTxByNormalizedMerchant([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      _max: { date: older },
    },
    {
      cardId: "card-1",
      merchant: "Netflix",
      _max: { date: recent },
    },
  ]);

  assert.equal(lastTransactions.get("card-1:Netflix"), recent);
});

test("detectUnusedSubscriptions keeps active subscriptions with recent raw-merchant activity", async (t) => {
  const original = {
    subscriptionFindMany: prisma.subscription.findMany,
    subscriptionUpdateMany: prisma.subscription.updateMany,
    transactionGroupBy: prisma.transaction.groupBy,
    alertFindMany: prisma.alert.findMany,
    alertCreateMany: prisma.alert.createMany,
  };

  t.after(() => {
    prisma.subscription.findMany = original.subscriptionFindMany;
    prisma.subscription.updateMany = original.subscriptionUpdateMany;
    prisma.transaction.groupBy = original.transactionGroupBy;
    prisma.alert.findMany = original.alertFindMany;
    prisma.alert.createMany = original.alertCreateMany;
  });

  let groupByArgs;
  let updateManyCalled = false;
  let createManyCalled = false;

  prisma.subscription.findMany = async () => [
    {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
    },
  ];
  prisma.transaction.groupBy = async (args) => {
    groupByArgs = args;
    return [
      {
        cardId: "card-1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
        _max: { date: new Date() },
      },
    ];
  };
  prisma.alert.findMany = async () => [];
  prisma.subscription.updateMany = async () => {
    updateManyCalled = true;
    return { count: 1 };
  };
  prisma.alert.createMany = async () => {
    createManyCalled = true;
    return { count: 1 };
  };

  await detectUnusedSubscriptions();

  assert.deepEqual(groupByArgs.where, {
    cardId: { in: ["card-1"] },
  });
  assert.equal(updateManyCalled, false);
  assert.equal(createManyCalled, false);
});

const assert = require("node:assert/strict");
const test = require("node:test");

const { prisma } = require("../dist/config/prisma");
const { detectUnusedSubscriptions } = require("../dist/jobs/unusedSubscription.job");

test("detectUnusedSubscriptions matches normalized subscription merchants to raw transaction descriptions", async (t) => {
  const originals = {
    subscriptionFindMany: prisma.subscription.findMany,
    subscriptionUpdateMany: prisma.subscription.updateMany,
    transactionFindMany: prisma.transaction.findMany,
    alertFindMany: prisma.alert.findMany,
    alertCreateMany: prisma.alert.createMany,
  };
  let transactionFindManyArgs;
  let updateManyCalled = false;
  let createManyCalled = false;

  prisma.subscription.findMany = async () => [
    {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
      status: "ACTIVE",
    },
  ];
  prisma.transaction.findMany = async (args) => {
    transactionFindManyArgs = args;
    return [
      {
        cardId: "card-1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
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
  t.after(() => {
    prisma.subscription.findMany = originals.subscriptionFindMany;
    prisma.subscription.updateMany = originals.subscriptionUpdateMany;
    prisma.transaction.findMany = originals.transactionFindMany;
    prisma.alert.findMany = originals.alertFindMany;
    prisma.alert.createMany = originals.alertCreateMany;
  });

  await detectUnusedSubscriptions();

  assert.deepEqual(transactionFindManyArgs.where.cardId, { in: ["card-1"] });
  assert.ok(transactionFindManyArgs.where.date.gte instanceof Date);
  assert.equal(updateManyCalled, false);
  assert.equal(createManyCalled, false);
});

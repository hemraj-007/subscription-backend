import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/test";

const { prisma } = require("../src/config/prisma") as typeof import("../src/config/prisma");
const { detectUnusedSubscriptions } = require("../src/jobs/unusedSubscription.job") as typeof import("../src/jobs/unusedSubscription.job");

type MockState = {
  subscriptions: Array<{
    id: string;
    userId: string;
    cardId: string;
    merchant: string;
  }>;
  transactions: Array<{
    cardId: string;
    merchant: string;
  }>;
  alerts?: Array<{
    userId: string;
    message: string;
  }>;
  transactionFindManyArgs: unknown[];
  updateManyArgs: unknown[];
  createManyArgs: unknown[];
};

function withMockedPrisma(state: MockState) {
  const original = {
    subscriptionFindMany: prisma.subscription.findMany,
    transactionFindMany: prisma.transaction.findMany,
    alertFindMany: prisma.alert.findMany,
    subscriptionUpdateMany: prisma.subscription.updateMany,
    alertCreateMany: prisma.alert.createMany,
  };

  (prisma.subscription.findMany as unknown) = async () => state.subscriptions;
  (prisma.transaction.findMany as unknown) = async (args: unknown) => {
    state.transactionFindManyArgs.push(args);
    return state.transactions;
  };
  (prisma.alert.findMany as unknown) = async () => state.alerts ?? [];
  (prisma.subscription.updateMany as unknown) = async (args: unknown) => {
    state.updateManyArgs.push(args);
    return { count: 1 };
  };
  (prisma.alert.createMany as unknown) = async (args: unknown) => {
    state.createManyArgs.push(args);
    return { count: 1 };
  };

  return () => {
    (prisma.subscription.findMany as unknown) = original.subscriptionFindMany;
    (prisma.transaction.findMany as unknown) = original.transactionFindMany;
    (prisma.alert.findMany as unknown) = original.alertFindMany;
    (prisma.subscription.updateMany as unknown) = original.subscriptionUpdateMany;
    (prisma.alert.createMany as unknown) = original.alertCreateMany;
  };
}

test("keeps a normalized subscription active when raw recent activity matches", async () => {
  const state: MockState = {
    subscriptions: [
      {
        id: "sub_netflix",
        userId: "user_1",
        cardId: "card_1",
        merchant: "Netflix",
      },
    ],
    transactions: [
      {
        cardId: "card_1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
      },
    ],
    transactionFindManyArgs: [],
    updateManyArgs: [],
    createManyArgs: [],
  };
  const restore = withMockedPrisma(state);

  try {
    await detectUnusedSubscriptions();
  } finally {
    restore();
  }

  assert.equal(state.updateManyArgs.length, 0);
  assert.equal(state.createManyArgs.length, 0);
  assert.equal(state.transactionFindManyArgs.length, 1);
  const transactionQuery = state.transactionFindManyArgs[0] as {
    where: {
      cardId: { in: string[] };
      date: { gte: Date };
    };
    select: {
      cardId: boolean;
      merchant: boolean;
    };
  };
  assert.deepEqual(transactionQuery.where.cardId, { in: ["card_1"] });
  assert.ok(transactionQuery.where.date.gte instanceof Date);
  assert.deepEqual(transactionQuery.select, {
    cardId: true,
    merchant: true,
  });
});

test("marks subscriptions at risk when there is no recent matching activity", async () => {
  const state: MockState = {
    subscriptions: [
      {
        id: "sub_netflix",
        userId: "user_1",
        cardId: "card_1",
        merchant: "Netflix",
      },
      {
        id: "sub_spotify",
        userId: "user_1",
        cardId: "card_1",
        merchant: "Spotify",
      },
    ],
    transactions: [
      {
        cardId: "card_1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
      },
    ],
    transactionFindManyArgs: [],
    updateManyArgs: [],
    createManyArgs: [],
  };
  const restore = withMockedPrisma(state);

  try {
    await detectUnusedSubscriptions();
  } finally {
    restore();
  }

  assert.deepEqual(state.updateManyArgs, [
    {
      where: {
        id: { in: ["sub_spotify"] },
        status: "ACTIVE",
      },
      data: { status: "AT_RISK" },
    },
  ]);
  assert.equal(state.createManyArgs.length, 1);
  const alertCreate = state.createManyArgs[0] as {
    data: Array<{
      userId: string;
      type: string;
      message: string;
      scheduledAt: Date;
    }>;
  };
  assert.deepEqual(alertCreate.data, [
    {
      userId: "user_1",
      type: "UNUSED",
      message: "You haven't used Spotify in 30 days",
      scheduledAt: alertCreate.data[0].scheduledAt,
    },
  ]);
  assert.ok(alertCreate.data[0].scheduledAt instanceof Date);
});

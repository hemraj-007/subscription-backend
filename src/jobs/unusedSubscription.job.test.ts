import { test } from "node:test";
import assert from "node:assert/strict";
import { SubscriptionStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import { detectUnusedSubscriptions } from "./unusedSubscription.job";

test("stale statements do not mark subscriptions unused without recent card activity", async (t) => {
  const subscriptionDelegate = prisma.subscription as unknown as {
    findMany: any;
    updateMany: any;
  };
  const transactionDelegate = prisma.transaction as unknown as {
    groupBy: any;
  };
  const alertDelegate = prisma.alert as unknown as {
    findMany: any;
    createMany: any;
  };

  const originals = {
    subscriptionFindMany: subscriptionDelegate.findMany,
    subscriptionUpdateMany: subscriptionDelegate.updateMany,
    transactionGroupBy: transactionDelegate.groupBy,
    alertFindMany: alertDelegate.findMany,
    alertCreateMany: alertDelegate.createMany,
  };

  let updateManyCalls = 0;
  let createManyCalls = 0;
  let groupByCalls = 0;

  t.after(() => {
    subscriptionDelegate.findMany = originals.subscriptionFindMany;
    subscriptionDelegate.updateMany = originals.subscriptionUpdateMany;
    transactionDelegate.groupBy = originals.transactionGroupBy;
    alertDelegate.findMany = originals.alertFindMany;
    alertDelegate.createMany = originals.alertCreateMany;
  });

  subscriptionDelegate.findMany = async () => [
    {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
      status: SubscriptionStatus.ACTIVE,
    },
  ];

  // Only historical charges exist (older than the inactivity window). A typical
  // "upload last month's statement in the middle of this month" dataset.
  transactionDelegate.groupBy = async (args: any) => {
    groupByCalls += 1;
    assert.deepEqual(args.by, ["cardId"]);
    assert.ok(args.where.date.gte instanceof Date);
    return [];
  };

  alertDelegate.findMany = async () => [];
  alertDelegate.createMany = async () => {
    createManyCalls += 1;
    return { count: 0 };
  };
  subscriptionDelegate.updateMany = async () => {
    updateManyCalls += 1;
    return { count: 0 };
  };

  await detectUnusedSubscriptions("user-1");

  assert.equal(groupByCalls, 1);
  assert.equal(updateManyCalls, 0);
  assert.equal(createManyCalls, 0);
});

test("flags unused when card has recent activity but merchant does not", async (t) => {
  const subscriptionDelegate = prisma.subscription as unknown as {
    findMany: any;
    updateMany: any;
  };
  const transactionDelegate = prisma.transaction as unknown as {
    groupBy: any;
  };
  const alertDelegate = prisma.alert as unknown as {
    findMany: any;
    createMany: any;
  };

  const originals = {
    subscriptionFindMany: subscriptionDelegate.findMany,
    subscriptionUpdateMany: subscriptionDelegate.updateMany,
    transactionGroupBy: transactionDelegate.groupBy,
    alertFindMany: alertDelegate.findMany,
    alertCreateMany: alertDelegate.createMany,
  };

  const updateManyArgs: unknown[] = [];
  const createManyArgs: unknown[] = [];

  t.after(() => {
    subscriptionDelegate.findMany = originals.subscriptionFindMany;
    subscriptionDelegate.updateMany = originals.subscriptionUpdateMany;
    transactionDelegate.groupBy = originals.transactionGroupBy;
    alertDelegate.findMany = originals.alertFindMany;
    alertDelegate.createMany = originals.alertCreateMany;
  });

  subscriptionDelegate.findMany = async () => [
    {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
      status: SubscriptionStatus.ACTIVE,
    },
  ];

  transactionDelegate.groupBy = async (args: any) => {
    if (args.by.length === 1 && args.by[0] === "cardId") {
      return [{ cardId: "card-1", _count: { _all: 3 } }];
    }
    // Recent card spend exists, but not for Netflix.
    assert.deepEqual(args.by, ["cardId", "merchant"]);
    return [
      {
        cardId: "card-1",
        merchant: "Uber",
        _max: { date: new Date() },
      },
    ];
  };

  alertDelegate.findMany = async () => [];
  alertDelegate.createMany = async (args: unknown) => {
    createManyArgs.push(args);
    return { count: 1 };
  };
  subscriptionDelegate.updateMany = async (args: unknown) => {
    updateManyArgs.push(args);
    return { count: 1 };
  };

  await detectUnusedSubscriptions("user-1");

  assert.equal(updateManyArgs.length, 1);
  assert.deepEqual((updateManyArgs[0] as any).where.id, { in: ["sub-1"] });
  assert.equal(createManyArgs.length, 1);
  assert.equal((createManyArgs[0] as any).data[0].type, "UNUSED");
  assert.match((createManyArgs[0] as any).data[0].message, /Netflix/);
});

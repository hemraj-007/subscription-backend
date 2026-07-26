import { test } from "node:test";
import assert from "node:assert/strict";
import { SubscriptionStatus, TransactionType } from "@prisma/client";

import { prisma } from "../config/prisma";
import {
  buildLastTxByCardMerchant,
  detectUnusedSubscriptions,
} from "./unusedSubscription.job";

test("unused detection normalizes raw transaction merchants", () => {
  const older = new Date("2026-05-01T00:00:00Z");
  const recent = new Date("2026-05-03T00:00:00Z");
  const lookup = buildLastTxByCardMerchant([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      date: older,
    },
    {
      cardId: "card-1",
      merchant: "Netflix Subscription",
      date: recent,
    },
  ]);

  assert.equal(lookup.get("card-1:Netflix")?.toISOString(), recent.toISOString());
});

test("marks unused subscriptions and creates alerts in one transaction", async (t) => {
  const transactionCalls: unknown[] = [];
  const subscriptionDelegate = prisma.subscription as unknown as {
    findMany: any;
    updateMany: any;
  };
  const transactionDelegate = prisma.transaction as unknown as {
    findMany: any;
  };
  const alertDelegate = prisma.alert as unknown as {
    findMany: any;
    createMany: any;
  };
  const prismaClient = prisma as unknown as {
    $transaction: any;
  };

  const originals = {
    subscriptionFindMany: subscriptionDelegate.findMany,
    transactionFindMany: transactionDelegate.findMany,
    alertFindMany: alertDelegate.findMany,
    alertCreateMany: alertDelegate.createMany,
    subscriptionUpdateMany: subscriptionDelegate.updateMany,
    transaction: prismaClient.$transaction,
  };
  t.after(() => {
    subscriptionDelegate.findMany = originals.subscriptionFindMany;
    transactionDelegate.findMany = originals.transactionFindMany;
    alertDelegate.findMany = originals.alertFindMany;
    alertDelegate.createMany = originals.alertCreateMany;
    subscriptionDelegate.updateMany = originals.subscriptionUpdateMany;
    prismaClient.$transaction = originals.transaction;
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
  // Recent activity exists only under the raw statement merchant name.
  // Exact-match lookups would miss this and falsely flag the subscription.
  transactionDelegate.findMany = async (args: any) => {
    assert.equal(args.where.type, TransactionType.DEBIT);
    assert.ok(args.where.date.gte instanceof Date);
    return [
      {
        cardId: "card-1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
        date: new Date(),
      },
    ];
  };
  alertDelegate.findMany = async () => [];
  alertDelegate.createMany = (args: unknown) => ({ kind: "createMany", args });
  subscriptionDelegate.updateMany = (args: unknown) => ({
    kind: "updateMany",
    args,
  });
  prismaClient.$transaction = async (ops: unknown[]) => {
    transactionCalls.push(ops);
    return ops;
  };

  await detectUnusedSubscriptions("user-1");

  // Recent normalized debit should prevent AT_RISK / alert creation.
  assert.equal(transactionCalls.length, 0);
});

test("atomically flips AT_RISK and inserts UNUSED alerts when idle", async (t) => {
  const transactionCalls: unknown[] = [];
  const subscriptionDelegate = prisma.subscription as unknown as {
    findMany: any;
    updateMany: any;
  };
  const transactionDelegate = prisma.transaction as unknown as {
    findMany: any;
  };
  const alertDelegate = prisma.alert as unknown as {
    findMany: any;
    createMany: any;
  };
  const prismaClient = prisma as unknown as {
    $transaction: any;
  };

  const originals = {
    subscriptionFindMany: subscriptionDelegate.findMany,
    transactionFindMany: transactionDelegate.findMany,
    alertFindMany: alertDelegate.findMany,
    alertCreateMany: alertDelegate.createMany,
    subscriptionUpdateMany: subscriptionDelegate.updateMany,
    transaction: prismaClient.$transaction,
  };
  t.after(() => {
    subscriptionDelegate.findMany = originals.subscriptionFindMany;
    transactionDelegate.findMany = originals.transactionFindMany;
    alertDelegate.findMany = originals.alertFindMany;
    alertDelegate.createMany = originals.alertCreateMany;
    subscriptionDelegate.updateMany = originals.subscriptionUpdateMany;
    prismaClient.$transaction = originals.transaction;
  });

  subscriptionDelegate.findMany = async () => [
    {
      id: "sub-idle",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Spotify",
      status: SubscriptionStatus.ACTIVE,
    },
  ];
  transactionDelegate.findMany = async () => [];
  alertDelegate.findMany = async () => [];

  let updateArgs: any;
  let createArgs: any;
  subscriptionDelegate.updateMany = (args: any) => {
    updateArgs = args;
    return { count: 1 };
  };
  alertDelegate.createMany = (args: any) => {
    createArgs = args;
    return { count: 1 };
  };
  prismaClient.$transaction = async (ops: unknown[]) => {
    transactionCalls.push(ops);
    return ops;
  };

  await detectUnusedSubscriptions("user-1");

  assert.equal(transactionCalls.length, 1);
  assert.equal((transactionCalls[0] as unknown[]).length, 2);
  assert.deepEqual(updateArgs, {
    where: {
      id: { in: ["sub-idle"] },
      status: SubscriptionStatus.ACTIVE,
    },
    data: { status: SubscriptionStatus.AT_RISK },
  });
  assert.equal(createArgs.data.length, 1);
  assert.equal(createArgs.data[0].type, "UNUSED");
  assert.match(createArgs.data[0].message, /Spotify/);
});

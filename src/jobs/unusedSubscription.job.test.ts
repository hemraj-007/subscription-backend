import { test } from "node:test";
import assert from "node:assert/strict";
import { SubscriptionStatus, TransactionType } from "@prisma/client";

import { prisma } from "../config/prisma";
import { detectUnusedSubscriptions } from "./unusedSubscription.job";
import { subscriptionService } from "../modules/subscription/subscription.service";

test("unused detection matches normalized transaction merchants before marking at risk", async (t) => {
  const subscriptionDelegate = prisma.subscription as unknown as {
    findMany: unknown;
    updateMany: unknown;
  };
  const transactionDelegate = prisma.transaction as unknown as {
    groupBy: unknown;
  };
  const alertDelegate = prisma.alert as unknown as {
    findMany: unknown;
    createMany: unknown;
  };

  const originals = {
    subscriptionFindMany: subscriptionDelegate.findMany,
    subscriptionUpdateMany: subscriptionDelegate.updateMany,
    transactionGroupBy: transactionDelegate.groupBy,
    alertFindMany: alertDelegate.findMany,
    alertCreateMany: alertDelegate.createMany,
  };
  t.after(() => {
    subscriptionDelegate.findMany = originals.subscriptionFindMany;
    subscriptionDelegate.updateMany = originals.subscriptionUpdateMany;
    transactionDelegate.groupBy = originals.transactionGroupBy;
    alertDelegate.findMany = originals.alertFindMany;
    alertDelegate.createMany = originals.alertCreateMany;
  });

  let updateCalled = false;
  subscriptionDelegate.findMany = async () => [
    {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
      amount: 649,
      frequency: "MONTHLY",
      status: SubscriptionStatus.ACTIVE,
      lastCharged: new Date("2026-07-01T00:00:00.000Z"),
      nextCharge: new Date("2026-07-31T00:00:00.000Z"),
      lastUserConfirmationAt: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    },
  ];
  transactionDelegate.groupBy = async (args: {
    where: { type: TransactionType };
  }) => {
    assert.equal(args.where.type, TransactionType.DEBIT);
    return [
      {
        cardId: "card-1",
        merchant: "NETFLIX.COM 866-716-0414",
        _max: { date: new Date() },
      },
    ];
  };
  alertDelegate.findMany = async () => [];
  subscriptionDelegate.updateMany = async () => {
    updateCalled = true;
    return { count: 1 };
  };
  alertDelegate.createMany = async () => ({ count: 1 });

  await detectUnusedSubscriptions("user-1");

  assert.equal(updateCalled, false);
});

test("detectAndSave reactivates an at-risk subscription when recurring charges are found", async (t) => {
  const transactionDelegate = prisma.transaction as unknown as {
    findMany: unknown;
  };
  const subscriptionDelegate = prisma.subscription as unknown as {
    upsert: unknown;
  };

  const originals = {
    transactionFindMany: transactionDelegate.findMany,
    subscriptionUpsert: subscriptionDelegate.upsert,
  };
  t.after(() => {
    transactionDelegate.findMany = originals.transactionFindMany;
    subscriptionDelegate.upsert = originals.subscriptionUpsert;
  });

  let upsertArgs: { update: { status?: SubscriptionStatus } } | undefined;

  transactionDelegate.findMany = async () => [
    {
      id: "tx-1",
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414",
      amount: 649,
      type: TransactionType.DEBIT,
      currency: "INR",
      date: new Date("2026-05-01T00:00:00.000Z"),
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    },
    {
      id: "tx-2",
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414",
      amount: 649,
      type: TransactionType.DEBIT,
      currency: "INR",
      date: new Date("2026-06-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    },
  ];
  subscriptionDelegate.upsert = async (args: {
    update: { status?: SubscriptionStatus };
  }) => {
    upsertArgs = args;
    return {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
      amount: 649,
      frequency: "MONTHLY",
      status: args.update.status ?? SubscriptionStatus.AT_RISK,
      lastCharged: new Date("2026-06-01T00:00:00.000Z"),
      nextCharge: new Date("2026-07-01T00:00:00.000Z"),
      lastUserConfirmationAt: null,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    };
  };

  await subscriptionService.detectAndSave("user-1");

  assert.equal(upsertArgs?.update.status, SubscriptionStatus.ACTIVE);
});

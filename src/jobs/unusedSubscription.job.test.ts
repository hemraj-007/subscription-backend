import { test } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../config/prisma";
import { detectUnusedSubscriptions } from "./unusedSubscription.job";

test("recent raw merchant activity keeps normalized subscriptions active", async (t) => {
  const original = {
    subscriptionFindMany: prisma.subscription.findMany,
    transactionFindMany: prisma.transaction.findMany,
    alertFindMany: prisma.alert.findMany,
    subscriptionUpdateMany: prisma.subscription.updateMany,
    alertCreateMany: prisma.alert.createMany,
  };

  const updateCalls: unknown[] = [];
  const createAlertCalls: unknown[] = [];

  (prisma.subscription as any).findMany = async () => [
    {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
    },
  ];
  (prisma.transaction as any).findMany = async () => [
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      date: new Date(),
    },
  ];
  (prisma.alert as any).findMany = async () => [];
  (prisma.subscription as any).updateMany = async (args: unknown) => {
    updateCalls.push(args);
    return { count: 1 };
  };
  (prisma.alert as any).createMany = async (args: unknown) => {
    createAlertCalls.push(args);
    return { count: 1 };
  };

  t.after(() => {
    (prisma.subscription as any).findMany = original.subscriptionFindMany;
    (prisma.transaction as any).findMany = original.transactionFindMany;
    (prisma.alert as any).findMany = original.alertFindMany;
    (prisma.subscription as any).updateMany = original.subscriptionUpdateMany;
    (prisma.alert as any).createMany = original.alertCreateMany;
  });

  await detectUnusedSubscriptions("user-1");

  assert.deepEqual(updateCalls, []);
  assert.deepEqual(createAlertCalls, []);
});

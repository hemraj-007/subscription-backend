import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { SubscriptionStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import { detectUnusedSubscriptions } from "./unusedSubscription.job";

type MockSubscription = {
  id: string;
  userId: string;
  cardId: string;
  merchant: string;
  status: SubscriptionStatus;
};

type MockTransaction = {
  cardId: string;
  merchant: string;
};

const mockPrisma = prisma as unknown as {
  subscription: {
    findMany: (...args: unknown[]) => Promise<MockSubscription[]>;
    updateMany: (...args: unknown[]) => Promise<{ count: number }>;
  };
  transaction: {
    findMany: (...args: unknown[]) => Promise<MockTransaction[]>;
  };
  alert: {
    findMany: (...args: unknown[]) => Promise<Array<{ userId: string; message: string }>>;
    createMany: (...args: unknown[]) => Promise<{ count: number }>;
  };
};

const original = {
  subscriptionFindMany: mockPrisma.subscription.findMany,
  subscriptionUpdateMany: mockPrisma.subscription.updateMany,
  transactionFindMany: mockPrisma.transaction.findMany,
  alertFindMany: mockPrisma.alert.findMany,
  alertCreateMany: mockPrisma.alert.createMany,
};

let subscriptions: MockSubscription[];
let transactions: MockTransaction[];
let existingAlerts: Array<{ userId: string; message: string }>;
let updateCalls: unknown[][];
let createManyCalls: unknown[][];
let transactionFindArgs: unknown[];

beforeEach(() => {
  subscriptions = [];
  transactions = [];
  existingAlerts = [];
  updateCalls = [];
  createManyCalls = [];
  transactionFindArgs = [];

  mockPrisma.subscription.findMany = async () => subscriptions;
  mockPrisma.subscription.updateMany = async (...args: unknown[]) => {
    updateCalls.push(args);
    const first = args[0] as { where?: { id?: { in?: string[] } } };
    return { count: first.where?.id?.in?.length ?? 0 };
  };
  mockPrisma.transaction.findMany = async (...args: unknown[]) => {
    transactionFindArgs = args;
    return transactions;
  };
  mockPrisma.alert.findMany = async () => existingAlerts;
  mockPrisma.alert.createMany = async (...args: unknown[]) => {
    createManyCalls.push(args);
    const first = args[0] as { data?: unknown[] };
    return { count: first.data?.length ?? 0 };
  };
});

after(() => {
  mockPrisma.subscription.findMany = original.subscriptionFindMany;
  mockPrisma.subscription.updateMany = original.subscriptionUpdateMany;
  mockPrisma.transaction.findMany = original.transactionFindMany;
  mockPrisma.alert.findMany = original.alertFindMany;
  mockPrisma.alert.createMany = original.alertCreateMany;
});

test("unused detection normalizes recent debits and reactivates at-risk subscriptions", async () => {
  subscriptions = [
    {
      id: "active-recent",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
      status: SubscriptionStatus.ACTIVE,
    },
    {
      id: "risk-recent",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Spotify",
      status: SubscriptionStatus.AT_RISK,
    },
    {
      id: "active-stale",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Adobe",
      status: SubscriptionStatus.ACTIVE,
    },
  ];
  transactions = [
    { cardId: "card-1", merchant: "NETFLIX.COM 866-716-0414 CA" },
    { cardId: "card-1", merchant: "SPOTIFY USA 1234567890" },
  ];

  await detectUnusedSubscriptions("user-1");

  const transactionWhere = (transactionFindArgs[0] as { where: Record<string, unknown> }).where;
  assert.equal(transactionWhere.type, "DEBIT");
  assert.ok(transactionWhere.date);

  assert.equal(updateCalls.length, 2);
  assert.deepEqual(
    (updateCalls[0][0] as { where: { id: { in: string[] } } }).where.id.in,
    ["active-stale"]
  );
  assert.equal(
    (updateCalls[0][0] as { data: { status: SubscriptionStatus } }).data.status,
    SubscriptionStatus.AT_RISK
  );
  assert.deepEqual(
    (updateCalls[1][0] as { where: { id: { in: string[] } } }).where.id.in,
    ["risk-recent"]
  );
  assert.equal(
    (updateCalls[1][0] as { data: { status: SubscriptionStatus } }).data.status,
    SubscriptionStatus.ACTIVE
  );

  assert.equal(createManyCalls.length, 1);
  const createdAlerts = (createManyCalls[0][0] as { data: Array<{ message: string }> }).data;
  assert.equal(createdAlerts.length, 1);
  assert.equal(createdAlerts[0].message, "You haven't used Adobe in 30 days");
});

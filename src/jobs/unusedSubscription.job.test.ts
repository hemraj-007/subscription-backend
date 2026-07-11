import { SubscriptionStatus } from "@prisma/client";
import { test } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../config/prisma";
import { detectUnusedSubscriptions } from "./unusedSubscription.job";

const DAY_MS = 24 * 60 * 60 * 1000;

function recentDate(): Date {
  return new Date(Date.now() - 5 * DAY_MS);
}

test("recent raw transaction activity is matched by normalized subscription merchant", async (t) => {
  const updateCalls: unknown[] = [];
  const alertCreateCalls: unknown[] = [];

  t.mock.method(prisma.subscription as any, "findMany", async () => [
    {
      id: "sub-active",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
      status: SubscriptionStatus.ACTIVE,
    },
  ]);
  t.mock.method(prisma.transaction as any, "findMany", async () => [
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      date: recentDate(),
    },
  ]);
  t.mock.method(prisma.alert as any, "findMany", async () => []);
  t.mock.method(prisma.subscription as any, "updateMany", async (args: unknown) => {
    updateCalls.push(args);
    return { count: 0 };
  });
  t.mock.method(prisma.alert as any, "createMany", async (args: unknown) => {
    alertCreateCalls.push(args);
    return { count: 0 };
  });

  await detectUnusedSubscriptions("user-1");

  assert.equal(updateCalls.length, 0);
  assert.equal(alertCreateCalls.length, 0);
});

test("at-risk subscriptions recover when normalized recent activity resumes", async (t) => {
  const updateCalls: any[] = [];

  t.mock.method(prisma.subscription as any, "findMany", async () => [
    {
      id: "sub-risk",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Spotify",
      status: SubscriptionStatus.AT_RISK,
    },
  ]);
  t.mock.method(prisma.transaction as any, "findMany", async () => [
    {
      cardId: "card-1",
      merchant: "SPOTIFY PREMIUM 1234567890",
      date: recentDate(),
    },
  ]);
  t.mock.method(prisma.alert as any, "findMany", async () => []);
  t.mock.method(prisma.subscription as any, "updateMany", async (args: any) => {
    updateCalls.push(args);
    return { count: 1 };
  });
  t.mock.method(prisma.alert as any, "createMany", async () => ({ count: 0 }));

  await detectUnusedSubscriptions("user-1");

  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0], {
    where: {
      id: { in: ["sub-risk"] },
      status: SubscriptionStatus.AT_RISK,
    },
    data: { status: SubscriptionStatus.ACTIVE },
  });
});

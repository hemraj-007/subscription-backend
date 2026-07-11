import { SubscriptionStatus } from "@prisma/client";
import { test } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../config/prisma";
import { detectUnusedSubscriptions } from "./unusedSubscription.job";

const DAY_MS = 24 * 60 * 60 * 1000;

function recentDate(): Date {
  return new Date(Date.now() - 5 * DAY_MS);
}

function replacePrismaDelegate(t: any, name: "subscription" | "transaction" | "alert", value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(prisma, name);
  Object.defineProperty(prisma, name, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  t.after(() => {
    if (descriptor) {
      Object.defineProperty(prisma, name, descriptor);
    } else {
      delete (prisma as any)[name];
    }
  });
}

test("recent raw transaction activity is matched by normalized subscription merchant", async (t) => {
  const updateCalls: unknown[] = [];
  const alertCreateCalls: unknown[] = [];

  replacePrismaDelegate(t, "subscription", {
    findMany: async () => [
      {
        id: "sub-active",
        userId: "user-1",
        cardId: "card-1",
        merchant: "Netflix",
        status: SubscriptionStatus.ACTIVE,
      },
    ],
    updateMany: async (args: unknown) => {
      updateCalls.push(args);
      return { count: 0 };
    },
  });
  replacePrismaDelegate(t, "transaction", {
    findMany: async () => [
      {
        cardId: "card-1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
        date: recentDate(),
      },
    ],
  });
  replacePrismaDelegate(t, "alert", {
    findMany: async () => [],
    createMany: async (args: unknown) => {
      alertCreateCalls.push(args);
      return { count: 0 };
    },
  });

  await detectUnusedSubscriptions("user-1");

  assert.equal(updateCalls.length, 0);
  assert.equal(alertCreateCalls.length, 0);
});

test("at-risk subscriptions recover when normalized recent activity resumes", async (t) => {
  const updateCalls: any[] = [];

  replacePrismaDelegate(t, "subscription", {
    findMany: async () => [
      {
        id: "sub-risk",
        userId: "user-1",
        cardId: "card-1",
        merchant: "Spotify",
        status: SubscriptionStatus.AT_RISK,
      },
    ],
    updateMany: async (args: any) => {
      updateCalls.push(args);
      return { count: 1 };
    },
  });
  replacePrismaDelegate(t, "transaction", {
    findMany: async () => [
      {
        cardId: "card-1",
        merchant: "SPOTIFY PREMIUM 1234567890",
        date: recentDate(),
      },
    ],
  });
  replacePrismaDelegate(t, "alert", {
    findMany: async () => [],
    createMany: async () => ({ count: 0 }),
  });

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

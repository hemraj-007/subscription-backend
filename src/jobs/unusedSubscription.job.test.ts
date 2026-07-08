import { SubscriptionStatus } from "@prisma/client";
import { test } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../config/prisma";
import { detectUnusedSubscriptions } from "./unusedSubscription.job";

type DelegateMethod = (...args: any[]) => any;

function setMethod<T extends object>(
  delegate: T,
  method: keyof T,
  replacement: DelegateMethod
): DelegateMethod {
  const original = delegate[method] as DelegateMethod;
  (delegate as Record<keyof T, DelegateMethod>)[method] = replacement;
  return original;
}

test("unused detection matches normalized transaction merchants and recovers active status", async () => {
  const subscription = prisma.subscription as unknown as {
    findMany: DelegateMethod;
    updateMany: DelegateMethod;
  };
  const transaction = prisma.transaction as unknown as {
    findMany: DelegateMethod;
  };
  const alert = prisma.alert as unknown as {
    findMany: DelegateMethod;
    createMany: DelegateMethod;
  };

  const updateCalls: any[] = [];
  const createdAlerts: any[] = [];

  const originals = {
    subscriptionFindMany: setMethod(subscription, "findMany", async (args) => {
      assert.deepEqual(args.where.userId, "user-1");
      assert.deepEqual(args.where.status.in, [
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.AT_RISK,
      ]);
      return [
        {
          id: "sub-recovered",
          userId: "user-1",
          cardId: "card-1",
          merchant: "Netflix",
          status: SubscriptionStatus.AT_RISK,
        },
        {
          id: "sub-unused",
          userId: "user-1",
          cardId: "card-1",
          merchant: "Spotify",
          status: SubscriptionStatus.ACTIVE,
        },
      ];
    }),
    subscriptionUpdateMany: setMethod(subscription, "updateMany", async (args) => {
      updateCalls.push(args);
      return { count: args.where.id.in.length };
    }),
    transactionFindMany: setMethod(transaction, "findMany", async (args) => {
      assert.deepEqual(args.where.cardId.in, ["card-1"]);
      assert.equal(args.where.type, "DEBIT");
      assert.ok(args.where.date.gte instanceof Date);
      return [
        {
          cardId: "card-1",
          merchant: "NETFLIX.COM 866-716-0414 CA",
          date: new Date(),
        },
      ];
    }),
    alertFindMany: setMethod(alert, "findMany", async () => []),
    alertCreateMany: setMethod(alert, "createMany", async (args) => {
      createdAlerts.push(...args.data);
      return { count: args.data.length };
    }),
  };

  try {
    await detectUnusedSubscriptions("user-1");
  } finally {
    subscription.findMany = originals.subscriptionFindMany;
    subscription.updateMany = originals.subscriptionUpdateMany;
    transaction.findMany = originals.transactionFindMany;
    alert.findMany = originals.alertFindMany;
    alert.createMany = originals.alertCreateMany;
  }

  assert.deepEqual(
    updateCalls.map((call) => ({
      ids: call.where.id.in,
      from: call.where.status,
      to: call.data.status,
    })),
    [
      {
        ids: ["sub-unused"],
        from: SubscriptionStatus.ACTIVE,
        to: SubscriptionStatus.AT_RISK,
      },
      {
        ids: ["sub-recovered"],
        from: SubscriptionStatus.AT_RISK,
        to: SubscriptionStatus.ACTIVE,
      },
    ]
  );
  assert.equal(createdAlerts.length, 1);
  assert.match(createdAlerts[0].message, /Spotify/);
});

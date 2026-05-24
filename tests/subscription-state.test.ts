import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../src/config/prisma";
import { detectUnusedSubscriptions } from "../src/jobs/unusedSubscription.job";
import { subscriptionService } from "../src/modules/subscription/subscription.service";
import * as detector from "../src/modules/subscription/subscription.detector";

const stubs: Array<{ object: Record<string, unknown>; key: string; value: unknown }> = [];

function stub(object: Record<string, unknown>, key: string, value: unknown) {
  stubs.push({ object, key, value: object[key] });
  object[key] = value;
}

afterEach(() => {
  while (stubs.length > 0) {
    const current = stubs.pop()!;
    current.object[current.key] = current.value;
  }
});

test("unused subscription job matches recent transactions by normalized merchant", async () => {
  const now = new Date();
  const recent = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  stub(prisma.subscription as unknown as Record<string, unknown>, "findMany", async () => [
    {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
      amount: 499,
      frequency: "MONTHLY",
      status: SubscriptionStatus.ACTIVE,
      lastCharged: recent,
      nextCharge: null,
      lastUserConfirmationAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  stub(prisma.transaction as unknown as Record<string, unknown>, "findMany", async (args: any) => {
    assert.deepEqual(args.where.cardId, { in: ["card-1"] });
    assert.ok(args.where.date.gte instanceof Date);
    assert.deepEqual(args.select, { cardId: true, merchant: true, date: true });
    return [
      {
        cardId: "card-1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
        date: recent,
      },
    ];
  });

  stub(prisma.alert as unknown as Record<string, unknown>, "findMany", async () => []);

  let updateManyCalls = 0;
  stub(prisma.subscription as unknown as Record<string, unknown>, "updateMany", async () => {
    updateManyCalls += 1;
    return { count: 1 };
  });

  let createManyCalls = 0;
  stub(prisma.alert as unknown as Record<string, unknown>, "createMany", async () => {
    createManyCalls += 1;
    return { count: 1 };
  });

  await detectUnusedSubscriptions();

  assert.equal(updateManyCalls, 0);
  assert.equal(createManyCalls, 0);
});

test("subscription detection reactivates subscriptions when charges recur", async () => {
  const lastCharged = new Date("2026-05-01T00:00:00.000Z");
  let upsertArgs: any;

  stub(detector as unknown as Record<string, unknown>, "detectSubscriptionGroups", async () => [
    {
      merchant: "Netflix",
      amount: 499,
      cardId: "card-1",
      dates: [new Date("2026-04-01T00:00:00.000Z"), lastCharged],
      rawMerchant: "NETFLIX.COM 866-716-0414 CA",
    },
  ]);

  stub(prisma.subscription as unknown as Record<string, unknown>, "upsert", async (args: any) => {
    upsertArgs = args;
    return {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
      amount: 499,
      frequency: "MONTHLY",
      status: args.update.status,
      lastCharged: args.update.lastCharged,
      nextCharge: args.update.nextCharge,
      lastUserConfirmationAt: null,
      createdAt: lastCharged,
      updatedAt: lastCharged,
    };
  });

  const subscriptions = await subscriptionService.detectAndSave("user-1");

  assert.equal(upsertArgs.update.status, SubscriptionStatus.ACTIVE);
  assert.equal(subscriptions[0].status, SubscriptionStatus.ACTIVE);
});

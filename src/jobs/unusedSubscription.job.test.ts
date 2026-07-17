import { test } from "node:test";
import assert from "node:assert/strict";
import { SubscriptionStatus, TransactionType } from "@prisma/client";

import { prisma } from "../config/prisma";
import { buildLastTxByCardMerchant } from "./unusedSubscription.job";
import { detectUnusedSubscriptions } from "./unusedSubscription.job";

test("unused detection lookup normalizes raw transaction merchants", () => {
  const recent = new Date("2026-05-03T00:00:00Z");
  const older = new Date("2026-04-03T00:00:00Z");

  const lookup = buildLastTxByCardMerchant([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
      _max: { date: older },
    },
    {
      cardId: "card-1",
      merchant: "Netflix Subscription",
      _max: { date: recent },
    },
  ]);

  assert.equal(lookup.get("card-1:Netflix")?.toISOString(), recent.toISOString());
});

test("at-risk subscriptions recover after recent debit activity resumes", async (t) => {
  const updates: any[] = [];

  t.mock.method(prisma.subscription as any, "findMany", async (args: any) => {
    assert.deepEqual(args.where.status, {
      in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.AT_RISK],
    });
    return [
      {
        id: "sub-risk",
        userId: "user-1",
        cardId: "card-1",
        merchant: "Spotify",
        status: SubscriptionStatus.AT_RISK,
      },
    ];
  });
  t.mock.method(prisma.transaction as any, "groupBy", async (args: any) => {
    assert.equal(args.where.type, TransactionType.DEBIT);
    return [
      {
        cardId: "card-1",
        merchant: "SPOTIFY PREMIUM 1234567890",
        _max: { date: new Date() },
      },
    ];
  });
  t.mock.method(prisma.alert as any, "findMany", async () => []);
  t.mock.method(prisma.subscription as any, "updateMany", async (args: any) => {
    updates.push(args);
    return { count: 1 };
  });
  t.mock.method(prisma.alert as any, "createMany", async () => ({ count: 0 }));

  await detectUnusedSubscriptions("user-1");

  assert.deepEqual(updates, [
    {
      where: {
        id: { in: ["sub-risk"] },
        status: SubscriptionStatus.AT_RISK,
      },
      data: { status: SubscriptionStatus.ACTIVE },
    },
  ]);
});

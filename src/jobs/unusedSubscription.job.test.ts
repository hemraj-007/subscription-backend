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
  t.after(() => {
    subscriptionDelegate.findMany = originals.subscriptionFindMany;
    subscriptionDelegate.updateMany = originals.subscriptionUpdateMany;
    transactionDelegate.groupBy = originals.transactionGroupBy;
    alertDelegate.findMany = originals.alertFindMany;
    alertDelegate.createMany = originals.alertCreateMany;
  });

  subscriptionDelegate.findMany = async (args: any) => {
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
  };
  transactionDelegate.groupBy = async (args: any) => {
    assert.equal(args.where.type, TransactionType.DEBIT);
    return [
      {
        cardId: "card-1",
        merchant: "SPOTIFY PREMIUM 1234567890",
        _max: { date: new Date() },
      },
    ];
  };
  alertDelegate.findMany = async () => [];
  subscriptionDelegate.updateMany = async (args: any) => {
    updates.push(args);
    return { count: 1 };
  };
  alertDelegate.createMany = async () => ({ count: 0 });

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

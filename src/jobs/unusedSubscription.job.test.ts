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

test("at-risk subscriptions recover after recent debit activity", async (t) => {
  const updates: unknown[] = [];
  const subscriptionDelegate = prisma.subscription as unknown as {
    findMany: any;
    updateMany: any;
  };
  const transactionDelegate = prisma.transaction as unknown as {
    findMany: any;
  };
  const alertDelegate = prisma.alert as unknown as {
    findMany: any;
  };

  const originals = {
    subscriptionFindMany: subscriptionDelegate.findMany,
    subscriptionUpdateMany: subscriptionDelegate.updateMany,
    transactionFindMany: transactionDelegate.findMany,
    alertFindMany: alertDelegate.findMany,
  };
  t.after(() => {
    subscriptionDelegate.findMany = originals.subscriptionFindMany;
    subscriptionDelegate.updateMany = originals.subscriptionUpdateMany;
    transactionDelegate.findMany = originals.transactionFindMany;
    alertDelegate.findMany = originals.alertFindMany;
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
  transactionDelegate.findMany = async (args: any) => {
    assert.equal(args.where.type, TransactionType.DEBIT);
    assert.ok(args.where.date.gte instanceof Date);
    return [
      {
        cardId: "card-1",
        merchant: "SPOTIFY PREMIUM 1234567890",
        date: new Date(),
      },
    ];
  };
  alertDelegate.findMany = async () => [];
  subscriptionDelegate.updateMany = async (args: unknown) => {
    updates.push(args);
    return { count: 1 };
  };

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

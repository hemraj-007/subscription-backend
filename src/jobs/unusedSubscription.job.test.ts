import { test } from "node:test";
import assert from "node:assert/strict";
import { SubscriptionStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import {
  detectUnusedSubscriptions,
  inactivityCutoff,
} from "./unusedSubscription.job";

test("inactivityCutoff is UTC midnight 30 calendar days before now", () => {
  // Afternoon UTC on day 30 after a May 1 charge must still treat May 1 as in-window.
  const afternoon = new Date(Date.UTC(2026, 4, 31, 15, 30, 45, 123));
  const cutoff = inactivityCutoff(afternoon);
  assert.equal(cutoff.toISOString(), "2026-05-01T00:00:00.000Z");

  const lastCharge = new Date(Date.UTC(2026, 4, 1));
  assert.equal(lastCharge < cutoff, false, "same calendar day must not be unused yet");
});

test("inactivityCutoff flags charges older than 30 calendar days", () => {
  const onDay31 = new Date(Date.UTC(2026, 5, 1, 0, 30, 0)); // June 1 00:30 UTC
  const cutoff = inactivityCutoff(onDay31);
  assert.equal(cutoff.toISOString(), "2026-05-02T00:00:00.000Z");

  const lastCharge = new Date(Date.UTC(2026, 4, 1));
  assert.equal(lastCharge < cutoff, true);
});

test("Railway-style 00:30 cron does not flag a charge from exactly 30 days ago", () => {
  // server.ts schedules unused detection at 00:30; wall-clock cutoff used to be
  // May 1 00:30 UTC, which made May 1 00:00 statement dates look inactive.
  const cronAt0030 = new Date(Date.UTC(2026, 4, 31, 0, 30, 0));
  const cutoff = inactivityCutoff(cronAt0030);
  assert.equal(cutoff.toISOString(), "2026-05-01T00:00:00.000Z");

  const lastCharge = new Date(Date.UTC(2026, 4, 1));
  assert.equal(lastCharge < cutoff, false);
});

test("detectUnusedSubscriptions keeps month-old UTC midnight charges active in the afternoon", async (t) => {
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

  let updateManyCalls = 0;
  let createManyCalls = 0;

  t.after(() => {
    subscriptionDelegate.findMany = originals.subscriptionFindMany;
    subscriptionDelegate.updateMany = originals.subscriptionUpdateMany;
    transactionDelegate.groupBy = originals.transactionGroupBy;
    alertDelegate.findMany = originals.alertFindMany;
    alertDelegate.createMany = originals.alertCreateMany;
  });

  subscriptionDelegate.findMany = async () => [
    {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
      status: SubscriptionStatus.ACTIVE,
    },
  ];

  transactionDelegate.groupBy = async () => [
    {
      cardId: "card-1",
      merchant: "Netflix",
      _max: { date: new Date(Date.UTC(2026, 4, 1)) },
    },
  ];

  alertDelegate.findMany = async () => [];
  alertDelegate.createMany = async () => {
    createManyCalls += 1;
    return { count: 0 };
  };
  subscriptionDelegate.updateMany = async () => {
    updateManyCalls += 1;
    return { count: 0 };
  };

  // May 31 15:00 UTC — 30 calendar days after May 1, with a nonzero clock time
  // that previously pushed cutoff past May 1 00:00 UTC.
  await detectUnusedSubscriptions(
    "user-1",
    new Date(Date.UTC(2026, 4, 31, 15, 0, 0))
  );

  assert.equal(updateManyCalls, 0, "must not mark AT_RISK on day 30 afternoon");
  assert.equal(createManyCalls, 0, "must not create UNUSED alerts on day 30 afternoon");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertsToDeleteAfterCardRemoval,
  renewalAlertMessage,
  unusedAlertMessage,
} from "./alert.messages";

test("renewal and unused alert messages match job copy", () => {
  assert.equal(
    renewalAlertMessage("Netflix", 649),
    "Netflix will charge ₹649 soon"
  );
  assert.equal(
    unusedAlertMessage("Spotify"),
    "You haven't used Spotify in 30 days"
  );
});

test("card removal deletes renewal alerts that would suppress later merchants", () => {
  const nextCharge = new Date("2026-09-01T00:00:00.000Z");
  const deletions = alertsToDeleteAfterCardRemoval(
    [{ merchant: "Netflix", amount: 649, nextCharge }],
    []
  );

  assert.deepEqual(deletions, [
    {
      type: "RENEWAL",
      message: "Netflix will charge ₹649 soon",
      scheduledAt: nextCharge,
    },
    {
      type: "UNUSED",
      message: "You haven't used Netflix in 30 days",
    },
  ]);
});

test("card removal keeps alerts still justified by another card", () => {
  const nextCharge = new Date("2026-09-01T00:00:00.000Z");
  const deletions = alertsToDeleteAfterCardRemoval(
    [{ merchant: "Netflix", amount: 649, nextCharge }],
    [
      {
        merchant: "Netflix",
        amount: 649,
        nextCharge,
        status: "ACTIVE",
      },
    ]
  );

  assert.deepEqual(deletions, []);
});

test("card removal deletes unused alert only when merchant is gone", () => {
  const deletions = alertsToDeleteAfterCardRemoval(
    [{ merchant: "Netflix", amount: 649, nextCharge: null }],
    [{ merchant: "Spotify", amount: 119, nextCharge: null, status: "ACTIVE" }]
  );

  assert.deepEqual(deletions, [
    {
      type: "UNUSED",
      message: "You haven't used Netflix in 30 days",
    },
  ]);
});

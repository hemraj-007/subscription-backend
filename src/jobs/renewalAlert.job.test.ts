import { test } from "node:test";
import assert from "node:assert/strict";

import { renewalAlertKey } from "./renewalAlert.job";

test("renewal alert identity keeps distinct subscriptions at the same time", () => {
  const scheduledAt = new Date("2026-08-01T00:00:00.000Z");

  const netflix = renewalAlertKey({
    userId: "user-1",
    message: "Netflix will charge ₹649 soon",
    scheduledAt,
  });
  const spotify = renewalAlertKey({
    userId: "user-1",
    message: "Spotify will charge ₹119 soon",
    scheduledAt,
  });

  assert.notEqual(netflix, spotify);
});

test("renewal alert identity deduplicates the same subscription alert", () => {
  const alert = {
    userId: "user-1",
    message: "Netflix will charge ₹649 soon",
    scheduledAt: new Date("2026-08-01T00:00:00.000Z"),
  };

  assert.equal(renewalAlertKey(alert), renewalAlertKey({ ...alert }));
});

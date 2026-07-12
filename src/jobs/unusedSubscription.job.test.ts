import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLastTxByCardMerchant } from "./unusedSubscription.job";

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

import { test } from "node:test";
import assert from "node:assert/strict";

import { cardService } from "../card/card.service";
import { resolveCardIdsForUser } from "./subscription.query";

test("resolveCardIdsForUser preserves an empty owned-card result", async (t) => {
  const original = cardService.filterOwnedCardIds;
  t.after(() => {
    cardService.filterOwnedCardIds = original;
  });

  cardService.filterOwnedCardIds = async () => [];

  const resolved = await resolveCardIdsForUser("user-1", ["missing-card"]);

  assert.deepEqual(resolved, []);
});

test("resolveCardIdsForUser returns undefined only when no filter was requested", async (t) => {
  const original = cardService.filterOwnedCardIds;
  let called = false;
  t.after(() => {
    cardService.filterOwnedCardIds = original;
  });

  cardService.filterOwnedCardIds = async () => {
    called = true;
    return [];
  };

  const resolved = await resolveCardIdsForUser("user-1");

  assert.equal(resolved, undefined);
  assert.equal(called, false);
});

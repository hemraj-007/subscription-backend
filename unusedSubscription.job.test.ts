import assert from "node:assert/strict";
import test from "node:test";
import { buildNormalizedTransactionKeys } from "./src/jobs/unusedSubscription.job";

test("matches raw statement merchants to normalized subscription merchants", () => {
  const keys = buildNormalizedTransactionKeys([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
    },
  ]);

  assert.equal(keys.has("card-1:Netflix"), true);
});

test("keeps card ids isolated when building normalized transaction keys", () => {
  const keys = buildNormalizedTransactionKeys([
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414 CA",
    },
  ]);

  assert.equal(keys.has("card-2:Netflix"), false);
});

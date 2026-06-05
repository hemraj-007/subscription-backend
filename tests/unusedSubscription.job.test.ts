import assert from "node:assert/strict";
import test from "node:test";
import { findUnusedSubscriptionCandidates } from "../src/jobs/unusedSubscription.job";

const cutoff = new Date("2026-06-01T00:00:00.000Z");

const baseSubscription = {
  id: "sub-netflix",
  userId: "user-1",
  cardId: "card-1",
  merchant: "Netflix",
};

test("keeps normalized subscription active when recent raw transaction matches", () => {
  const unused = findUnusedSubscriptionCandidates(
    [baseSubscription],
    [
      {
        cardId: "card-1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
        date: new Date("2026-06-02T00:00:00.000Z"),
      },
    ],
    cutoff
  );

  assert.deepEqual(unused, []);
});

test("flags subscription when matching raw transaction is older than cutoff", () => {
  const unused = findUnusedSubscriptionCandidates(
    [baseSubscription],
    [
      {
        cardId: "card-1",
        merchant: "NETFLIX.COM 866-716-0414 CA",
        date: new Date("2026-05-01T00:00:00.000Z"),
      },
    ],
    cutoff
  );

  assert.deepEqual(unused.map((sub) => sub.id), ["sub-netflix"]);
});

test("does not satisfy a subscription with a matching transaction on another card", () => {
  const unused = findUnusedSubscriptionCandidates(
    [baseSubscription],
    [
      {
        cardId: "card-2",
        merchant: "NETFLIX.COM 866-716-0414 CA",
        date: new Date("2026-06-02T00:00:00.000Z"),
      },
    ],
    cutoff
  );

  assert.deepEqual(unused.map((sub) => sub.id), ["sub-netflix"]);
});

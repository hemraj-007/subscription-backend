import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionActivityKey } from "../src/jobs/unusedSubscription.job";

test("subscription activity keys normalize raw statement merchants", () => {
  assert.equal(
    subscriptionActivityKey("card-1", "NETFLIX.COM 866-716-0414 CA"),
    subscriptionActivityKey("card-1", "Netflix")
  );
});

test("subscription activity keys remain scoped to the card", () => {
  assert.notEqual(
    subscriptionActivityKey("card-1", "NETFLIX.COM 866-716-0414 CA"),
    subscriptionActivityKey("card-2", "Netflix")
  );
});

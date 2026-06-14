const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildSubscriptionActivityKey,
} = require("../dist/jobs/subscriptionActivityKey");

test("unused subscription activity keys match normalized statement merchants", () => {
  assert.equal(
    buildSubscriptionActivityKey("card-1", "NETFLIX.COM 866-716-0414 CA", 499),
    buildSubscriptionActivityKey("card-1", "Netflix", 499)
  );
});

test("unused subscription activity keys include amount", () => {
  assert.notEqual(
    buildSubscriptionActivityKey("card-1", "AMAZON.COM", 999),
    buildSubscriptionActivityKey("card-1", "Amazon", 1499)
  );
});

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isLikelySubscriptionCharge,
  normalizeMerchant,
} = require("../dist/modules/subscription/merchant.normalizer.js");

test("single Amazon marketplace charges are not classified as subscriptions", () => {
  assert.equal(isLikelySubscriptionCharge("AMAZON MKTS ORDER 12345"), false);
  assert.equal(isLikelySubscriptionCharge("Amazon.com purchase"), false);
});

test("specific subscription merchants still qualify as single-charge subscriptions", () => {
  assert.equal(isLikelySubscriptionCharge("Amazon Prime membership"), true);
  assert.equal(isLikelySubscriptionCharge("NETFLIX.COM 866-716-0414"), true);
});

test("broad merchants still normalize for recurrence grouping", () => {
  assert.equal(normalizeMerchant("AMAZON MKTS ORDER 12345"), "Amazon");
});

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  isLikelySubscriptionCharge,
  normalizeMerchant,
} = require("../dist/modules/subscription/merchant.normalizer");

test("rejects single broad marketplace purchases as subscriptions", () => {
  assert.equal(isLikelySubscriptionCharge("AMAZON.COM AMZN.COM/BILL"), false);
  assert.equal(isLikelySubscriptionCharge("APPLE.COM/BILL APP STORE"), false);
  assert.equal(isLikelySubscriptionCharge("STEAMPOWERED.COM GAME PURCHASE"), false);
  assert.equal(isLikelySubscriptionCharge("LINKEDIN.COM ADS"), false);
  assert.equal(isLikelySubscriptionCharge("FLIPKART INTERNET PRIVATE"), false);
});

test("accepts explicit single subscription charges", () => {
  assert.equal(isLikelySubscriptionCharge("NETFLIX.COM 866-716-0414"), true);
  assert.equal(isLikelySubscriptionCharge("AMAZON PRIME MEMBERSHIP"), true);
  assert.equal(isLikelySubscriptionCharge("APPLE ICLOUD STORAGE"), true);
  assert.equal(isLikelySubscriptionCharge("LINKEDIN PREMIUM"), true);
  assert.equal(isLikelySubscriptionCharge("ACME PRO MEMBERSHIP"), true);
});

test("normalization still groups broad known merchants", () => {
  assert.equal(normalizeMerchant("AMAZON.COM AMZN.COM/BILL"), "Amazon");
  assert.equal(normalizeMerchant("APPLE.COM/BILL APP STORE"), "Apple");
});

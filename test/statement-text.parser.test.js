const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseTransactionsFromPdfContent,
} = require("../dist/modules/transaction/statement-text.parser");

function byMerchant(transactions, merchant) {
  return transactions.find((tx) => tx.merchant.includes(merchant));
}

test("does not treat phone country codes as signed transaction amounts", () => {
  const transactions = parseTransactionsFromPdfContent(
    "Statement Period: 01 Jan 2024 to 31 Jan 2024",
    [["01-Jan", "NETFLIX INDIA +91 8665797172", "649.00", "45,231.00"]]
  );

  const netflix = byMerchant(transactions, "NETFLIX INDIA");
  assert.ok(netflix);
  assert.equal(netflix.amount, 649);
});

test("assigns DD-Mon dates to the correct year for cross-year statements", () => {
  const transactions = parseTransactionsFromPdfContent(
    "Statement Period: 01 Dec 2024 to 31 Jan 2025",
    [
      ["15-Dec", "AMAZON PAY", "-1,234.56"],
      ["02-Jan", "SPOTIFY", "-119.00"],
    ]
  );

  const amazon = byMerchant(transactions, "AMAZON PAY");
  const spotify = byMerchant(transactions, "SPOTIFY");

  assert.ok(amazon);
  assert.ok(spotify);
  assert.equal(amazon.date.getFullYear(), 2024);
  assert.equal(amazon.date.getMonth(), 11);
  assert.equal(spotify.date.getFullYear(), 2025);
  assert.equal(spotify.date.getMonth(), 0);
});

test("merges compact rows with table fallback rows instead of returning a partial import", () => {
  const transactions = parseTransactionsFromPdfContent(
    "Statement Period: 01 Jan 2024 to 31 Jan 2024",
    [
      ["01-Jan", "SPOTIFY", "-119.00"],
      ["Transaction Date", "Description", "Amount"],
      ["02/01/2024", "NETFLIX", "649.00"],
    ]
  );

  assert.ok(byMerchant(transactions, "SPOTIFY"));
  assert.ok(byMerchant(transactions, "NETFLIX"));
});

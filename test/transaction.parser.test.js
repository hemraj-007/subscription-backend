const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { parseCSV } = require("../dist/modules/transaction/transaction.parser");

async function withCsv(contents, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "statement-csv-"));
  const filePath = path.join(dir, "statement.csv");
  await fs.writeFile(filePath, contents);

  try {
    return await run(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("parseCSV falls back from empty debit cells to credit values", async () => {
  await withCsv(
    [
      "Date,Description,Debit,Credit",
      "2026-01-05,NETFLIX,,649",
      "2026-01-10,SPOTIFY,119,",
    ].join("\n"),
    async (filePath) => {
      const transactions = await parseCSV(filePath);

      assert.equal(transactions.length, 2);
      assert.deepEqual(
        transactions.map((tx) => [tx.merchant, tx.amount]),
        [
          ["NETFLIX", 649],
          ["SPOTIFY", 119],
        ]
      );
    }
  );
});

test("parseCSV uses withdrawal/deposit amounts instead of running balance", async () => {
  await withCsv(
    [
      "Date,Narration,Withdrawal,Deposit,Balance",
      "2026-02-01,ADOBE,499,,45230.50",
      "2026-02-03,REFUND,,250,45480.50",
    ].join("\n"),
    async (filePath) => {
      const transactions = await parseCSV(filePath);

      assert.equal(transactions.length, 2);
      assert.deepEqual(
        transactions.map((tx) => [tx.merchant, tx.amount]),
        [
          ["ADOBE", 499],
          ["REFUND", 250],
        ]
      );
    }
  );
});

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { parseCSV } = require("../dist/modules/transaction/transaction.parser");

async function writeTempCsv(contents) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "statement-"));
  const filePath = path.join(dir, "statement.csv");
  await fs.writeFile(filePath, contents);
  return { dir, filePath };
}

test("parseCSV reads debit and credit columns row-by-row", async () => {
  const { dir, filePath } = await writeTempCsv(
    [
      "Date,Description,Debit,Credit",
      "2026-05-01,Netflix,649,",
      "2026-05-02,Refund,,100",
    ].join("\n")
  );

  try {
    const transactions = await parseCSV(filePath);

    assert.equal(transactions.length, 2);
    assert.deepEqual(
      transactions.map((tx) => tx.amount),
      [649, 100]
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("parseCSV rejects balance-only exports instead of importing balances as amounts", async () => {
  const { dir, filePath } = await writeTempCsv(
    [
      "Date,Narration,Balance",
      "2026-05-01,Netflix,45000",
      "2026-05-02,Spotify,44900",
    ].join("\n")
  );

  try {
    await assert.rejects(
      () => parseCSV(filePath),
      /No transactions found in CSV/
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("parseCSV rejects CSV files with no parseable transactions", async () => {
  const { dir, filePath } = await writeTempCsv(
    [
      "Date,Description,Amount",
      "not-a-date,Netflix,649",
      "2026-05-02,Spotify,0",
    ].join("\n")
  );

  try {
    await assert.rejects(
      () => parseCSV(filePath),
      /No transactions found in CSV/
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

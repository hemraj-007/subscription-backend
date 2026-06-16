const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { parseCSV } = require("../dist/modules/transaction/transaction.parser.js");

async function withCsv(contents, callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "statement-parser-"));
  const filePath = path.join(dir, "statement.csv");

  try {
    await fs.writeFile(filePath, contents);
    return await callback(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("parseCSV does not use running balance as a transaction amount", async () => {
  const rows = await withCsv(
    [
      "Date,Description,Balance",
      "2026-01-01,NETFLIX.COM 866-716-0414,1200.00",
      "",
    ].join("\n"),
    parseCSV
  );

  assert.deepEqual(rows, []);
});

test("parseCSV prefers withdrawal amount over running balance", async () => {
  const rows = await withCsv(
    [
      "Date,Description,Withdrawal,Balance",
      "2026-01-01,NETFLIX.COM 866-716-0414,499.00,1200.00",
      "",
    ].join("\n"),
    parseCSV
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].merchant, "NETFLIX.COM 866-716-0414");
  assert.equal(rows[0].amount, 499);
  assert.equal(rows[0].date.toISOString(), "2026-01-01T00:00:00.000Z");
});

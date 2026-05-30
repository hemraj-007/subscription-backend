import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseCSV } from "../src/modules/transaction/transaction.parser";

async function withCsv<T>(contents: string, run: (filePath: string) => Promise<T>) {
  const dir = await mkdtemp(path.join(tmpdir(), "statement-parser-"));
  const filePath = path.join(dir, "statement.csv");

  try {
    await writeFile(filePath, contents);
    return await run(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("parseCSV reads credit rows when a statement has separate debit and credit columns", async () => {
  const transactions = await withCsv(
    [
      "Date,Narration,Debit,Credit,Balance",
      "2026-04-01,NETFLIX.COM,649,,10000",
      "2026-04-03,REFUND FROM STORE,,300,10300",
    ].join("\n"),
    parseCSV
  );

  assert.equal(transactions.length, 2);
  assert.deepEqual(
    transactions.map((tx) => ({ merchant: tx.merchant, amount: tx.amount })),
    [
      { merchant: "NETFLIX.COM", amount: 649 },
      { merchant: "REFUND FROM STORE", amount: 300 },
    ]
  );
});

test("parseCSV does not import running balances as transaction amounts", async () => {
  const transactions = await withCsv(
    ["Date,Description,Balance", "2026-04-01,OPENING BALANCE,10000"].join("\n"),
    parseCSV
  );

  assert.deepEqual(transactions, []);
});

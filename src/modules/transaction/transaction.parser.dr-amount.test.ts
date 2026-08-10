import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCSV } from "./transaction.parser";

async function withCsv(
  lines: string[],
  run: (file: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "subscription-csv-dr-"));
  const file = path.join(dir, "statement.csv");
  try {
    await writeFile(file, lines.join("\n"));
    await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("CSV Dr Amount / Cr Amount columns preserve credits", async () => {
  await withCsv(
    [
      "Date,Description,Dr Amount,Cr Amount",
      "2026-05-03,Netflix,649,",
      "2026-05-01,Salary,,48000",
    ],
    async (file) => {
      const txs = await parseCSV(file);
      assert.equal(txs.length, 2);
      assert.equal(txs.find((tx) => tx.merchant === "Netflix")?.type, "DEBIT");
      assert.equal(txs.find((tx) => tx.merchant === "Netflix")?.amount, 649);
      assert.equal(txs.find((tx) => tx.merchant === "Salary")?.type, "CREDIT");
      assert.equal(txs.find((tx) => tx.merchant === "Salary")?.amount, 48000);
    }
  );
});

test("CSV Amount Debited / Amount Credited columns preserve credits", async () => {
  await withCsv(
    [
      "Date,Description,Amount Debited,Amount Credited",
      "2026-05-03,Netflix,649,",
      "2026-05-02,Refund,,649",
    ],
    async (file) => {
      const txs = await parseCSV(file);
      assert.equal(txs.length, 2);
      assert.equal(txs.find((tx) => tx.merchant === "Netflix")?.type, "DEBIT");
      assert.equal(txs.find((tx) => tx.merchant === "Refund")?.type, "CREDIT");
      assert.equal(txs.find((tx) => tx.merchant === "Refund")?.amount, 649);
    }
  );
});

test("CSV Amount Debited (INR) headers normalize punctuation", async () => {
  await withCsv(
    [
      "Date,Description,Amount Debited (INR),Amount Credited (INR)",
      "2026-05-03,Spotify,119,",
      "2026-05-01,Salary,,50000",
    ],
    async (file) => {
      const txs = await parseCSV(file);
      assert.equal(txs.length, 2);
      assert.equal(txs.find((tx) => tx.merchant === "Spotify")?.type, "DEBIT");
      assert.equal(txs.find((tx) => tx.merchant === "Salary")?.type, "CREDIT");
      assert.equal(txs.find((tx) => tx.merchant === "Salary")?.amount, 50000);
    }
  );
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCSV } from "./transaction.parser";

async function withCsv<T>(content: string, fn: (filePath: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "statement-csv-"));
  const filePath = path.join(dir, "statement.csv");
  try {
    await writeFile(filePath, content);
    return await fn(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

test("single amount CSV treats negative values as debit charges", async () => {
  await withCsv(
    "Date,Description,Amount\n03/05/2026,Netflix Subscription,-649\n",
    async (filePath) => {
      const txs = await parseCSV(filePath);

      assert.equal(txs.length, 1);
      assert.equal(txs[0].merchant, "Netflix Subscription");
      assert.equal(txs[0].amount, 649);
      assert.equal(txs[0].type, "DEBIT");
      assert.equal(isoDay(txs[0].date), "2026-05-03");
    }
  );
});

test("single amount CSV treats explicit positive values as credits", async () => {
  await withCsv(
    "Date,Description,Amount\n01/05/2026,Salary Credit,+48000\n",
    async (filePath) => {
      const txs = await parseCSV(filePath);

      assert.equal(txs.length, 1);
      assert.equal(txs[0].merchant, "Salary Credit");
      assert.equal(txs[0].amount, 48000);
      assert.equal(txs[0].type, "CREDIT");
      assert.equal(isoDay(txs[0].date), "2026-05-01");
    }
  );
});

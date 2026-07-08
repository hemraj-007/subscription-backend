import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCSV } from "./transaction.parser";
import { ParsedTransaction } from "./transaction.types";

function find(txs: ParsedTransaction[], merchant: string): ParsedTransaction {
  const match = txs.find((tx) => tx.merchant === merchant);
  assert.ok(match, `expected ${merchant} transaction`);
  return match;
}

test("single amount CSV columns classify signed debits and credits", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "statement-csv-"));
  const file = path.join(dir, "statement.csv");

  try {
    await writeFile(
      file,
      [
        "Date,Description,Amount",
        "03/05/2026,Netflix Subscription,-649",
        "01/05/2026,Salary Credit,+48000",
        "04/05/2026,Spotify Premium,119",
      ].join("\n")
    );

    const txs = await parseCSV(file);

    assert.equal(find(txs, "Netflix Subscription").type, "DEBIT");
    assert.equal(find(txs, "Salary Credit").type, "CREDIT");
    assert.equal(find(txs, "Spotify Premium").type, "DEBIT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseCSV } from "./transaction.parser";

async function parseCsvContent(content: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "statement-csv-"));
  const filePath = path.join(dir, "statement.csv");
  writeFileSync(filePath, content);
  try {
    return await parseCSV(filePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("single amount CSV treats explicit plus as credit and minus as debit", async () => {
  const txs = await parseCsvContent(
    [
      "date,merchant,amount",
      "2026-05-03,Netflix Subscription,-649",
      "2026-05-04,Refund,+649",
      "2026-05-05,Spotify Premium,119",
    ].join("\n")
  );

  assert.equal(txs.length, 3);
  assert.equal(txs[0]?.type, "DEBIT");
  assert.equal(txs[0]?.amount, 649);
  assert.equal(txs[1]?.type, "CREDIT");
  assert.equal(txs[1]?.amount, 649);
  assert.equal(txs[2]?.type, "DEBIT");
  assert.equal(txs[2]?.amount, 119);
});

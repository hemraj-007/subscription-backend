import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseCSV } from "./transaction.parser";

async function parseCsvText(text: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "transaction-parser-"));
  const file = path.join(dir, "statement.csv");
  await fs.writeFile(file, text);

  try {
    return await parseCSV(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("generic signed CSV amounts use app debit/credit convention", async () => {
  const txs = await parseCsvText(
    [
      "Date,Description,Amount",
      "2026-05-03,Netflix,-649",
      "2026-05-01,Salary,+48000",
      "2026-05-04,Spotify,119",
    ].join("\n")
  );

  const byMerchant = new Map(txs.map((tx) => [tx.merchant, tx]));
  assert.equal(byMerchant.get("Netflix")?.type, "DEBIT");
  assert.equal(byMerchant.get("Netflix")?.amount, 649);
  assert.equal(byMerchant.get("Salary")?.type, "CREDIT");
  assert.equal(byMerchant.get("Salary")?.amount, 48000);
  assert.equal(byMerchant.get("Spotify")?.type, "DEBIT");
  assert.equal(byMerchant.get("Spotify")?.amount, 119);
});

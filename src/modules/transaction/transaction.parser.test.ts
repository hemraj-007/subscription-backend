import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCSV } from "./transaction.parser";

test("single amount CSV signs map to the correct transaction type", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "statement-csv-"));
  const filePath = path.join(dir, "statement.csv");

  try {
    await writeFile(
      filePath,
      [
        "Date,Description,Amount",
        "2026-05-01,Salary,+48000",
        "2026-05-03,Netflix,-649",
        "2026-05-04,Gym,(649)",
        "2026-05-05,Spotify,119",
      ].join("\n")
    );

    const txs = await parseCSV(filePath);
    const byMerchant = new Map(txs.map((tx) => [tx.merchant, tx]));

    assert.equal(byMerchant.get("Salary")?.type, "CREDIT");
    assert.equal(byMerchant.get("Netflix")?.type, "DEBIT");
    assert.equal(byMerchant.get("Gym")?.type, "DEBIT");
    assert.equal(byMerchant.get("Spotify")?.type, "DEBIT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

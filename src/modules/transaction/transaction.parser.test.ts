import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCSV } from "./transaction.parser";

test("single amount CSV uses plus as credit and negative or unsigned as debit", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "transactions-"));
  const filePath = path.join(dir, "statement.csv");

  try {
    writeFileSync(
      filePath,
      [
        "Date,Description,Amount",
        "2026-05-01,Salary,+48000",
        "2026-05-03,Netflix,-649",
        "2026-05-04,Spotify,119",
      ].join("\n")
    );

    const txs = await parseCSV(filePath);
    assert.equal(txs.length, 3);
    assert.equal(txs.find((tx) => tx.merchant === "Salary")?.type, "CREDIT");
    assert.equal(txs.find((tx) => tx.merchant === "Netflix")?.type, "DEBIT");
    assert.equal(txs.find((tx) => tx.merchant === "Spotify")?.type, "DEBIT");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCSV } from "./transaction.parser";

test("single amount CSV signs preserve transaction direction", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "subscription-csv-"));
  const file = path.join(dir, "statement.csv");

  try {
    await writeFile(
      file,
      [
        "date,description,amount",
        "2026-05-01,Salary,+48000",
        "2026-05-03,Netflix,-649",
        "2026-05-04,Spotify,(119)",
        "2026-05-05,Notion,99",
      ].join("\n")
    );

    const txs = await parseCSV(file);
    assert.equal(txs.length, 4);
    assert.equal(txs.find((tx) => tx.merchant === "Salary")?.type, "CREDIT");
    assert.equal(txs.find((tx) => tx.merchant === "Netflix")?.type, "DEBIT");
    assert.equal(txs.find((tx) => tx.merchant === "Spotify")?.type, "DEBIT");
    assert.equal(txs.find((tx) => tx.merchant === "Notion")?.type, "DEBIT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

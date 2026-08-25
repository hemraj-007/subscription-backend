import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { parseCSV } from "./transaction.parser";
import { ParsedTransaction } from "./transaction.types";

async function parseCsvText(csv: string): Promise<ParsedTransaction[]> {
  const filePath = path.join(
    os.tmpdir(),
    `stmt-preamble-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
  );
  fs.writeFileSync(filePath, csv);
  try {
    return await parseCSV(filePath);
  } finally {
    fs.unlinkSync(filePath);
  }
}

function find(txs: ParsedTransaction[], merchant: string): ParsedTransaction {
  const match = txs.find((t) => t.merchant === merchant);
  assert.ok(match, `expected a transaction for "${merchant}"`);
  return match!;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

test("CSV with bank title/preamble rows still imports transactions", async () => {
  const txs = await parseCsvText(
    [
      "Account Statement",
      "Account Number,50100012345678",
      "Customer Name,JOHN DOE",
      "From Date,01/05/2026",
      "To Date,31/05/2026",
      "",
      "Date,Narration,Debit,Credit,Balance",
      "03/05/2026,NETFLIX.COM,649.00,,14351.00",
      "01/05/2026,Salary Credit,,48000.00,62351.00",
    ].join("\n")
  );

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX.COM").amount, 649);
  assert.equal(find(txs, "NETFLIX.COM").type, "DEBIT");
  assert.equal(isoDay(find(txs, "NETFLIX.COM").date), "2026-05-03");
  assert.equal(find(txs, "Salary Credit").amount, 48000);
  assert.equal(find(txs, "Salary Credit").type, "CREDIT");
});

test("CSV Excel sep= preamble is skipped", async () => {
  const txs = await parseCsvText(
    [
      "sep=,",
      "Date,Description,Amount",
      "03/05/2026,NETFLIX.COM,649.00",
      "04/05/2026,Spotify Premium,119.00",
    ].join("\n")
  );

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX.COM").amount, 649);
  assert.equal(find(txs, "Spotify Premium").amount, 119);
});

test("CSV header-only files without preamble still import", async () => {
  const txs = await parseCsvText(
    [
      "Date,Description,Amount",
      "03/05/2026,NETFLIX.COM,649.00",
    ].join("\n")
  );

  assert.equal(txs.length, 1);
  assert.equal(find(txs, "NETFLIX.COM").amount, 649);
  assert.equal(find(txs, "NETFLIX.COM").type, "DEBIT");
  assert.equal(isoDay(find(txs, "NETFLIX.COM").date), "2026-05-03");
});

test("CSV UTF-8 BOM plus title row still finds the header", async () => {
  const txs = await parseCsvText(
    "\uFEFFAccount Statement\nDate,Description,Amount\n03/05/2026,NETFLIX.COM,649.00\n"
  );

  assert.equal(txs.length, 1);
  assert.equal(find(txs, "NETFLIX.COM").amount, 649);
});

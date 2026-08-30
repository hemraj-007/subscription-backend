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
    `paid-out-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
  );
  fs.writeFileSync(filePath, csv);
  try {
    return await parseCSV(filePath);
  } finally {
    fs.unlinkSync(filePath);
  }
}

function find(txs: ParsedTransaction[], merchantPart: string): ParsedTransaction {
  const match = txs.find((t) =>
    t.merchant.toLowerCase().includes(merchantPart.toLowerCase())
  );
  assert.ok(match, `expected a transaction matching "${merchantPart}"`);
  return match!;
}

test("CSV Paid Out / Paid In columns import debit and credit rows", async () => {
  const txs = await parseCsvText(
    [
      "Date,Narration,Paid Out,Paid In,Balance",
      "03/05/2026,NETFLIX.COM,649.00,,124351.00",
      "01/05/2026,Salary Credit,,48000.00,125000.00",
    ].join("\n")
  );

  assert.equal(txs.length, 2);

  const netflix = find(txs, "NETFLIX");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");
  assert.equal(netflix.date.toISOString().slice(0, 10), "2026-05-03");

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");
});

test("CSV Money Out / Money In headers still classify credits", async () => {
  const txs = await parseCsvText(
    [
      "Date,Description,Money Out,Money In,Balance",
      "03/05/2026,NETFLIX.COM,649.00,,124351.00",
      "01/05/2026,Salary Credit,,48000.00,125000.00",
    ].join("\n")
  );

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX").type, "DEBIT");
  assert.equal(find(txs, "Salary").type, "CREDIT");
});

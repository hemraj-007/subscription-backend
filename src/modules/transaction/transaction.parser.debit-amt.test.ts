import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { parseCSV } from "./transaction.parser";
import { ParsedTransaction } from "./transaction.types";

async function parseCsv(contents: string): Promise<ParsedTransaction[]> {
  const file = path.join(
    os.tmpdir(),
    `debit-amt-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
  );
  fs.writeFileSync(file, contents, "utf8");
  try {
    return await parseCSV(file);
  } finally {
    fs.unlinkSync(file);
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

test("CSV Debit Amt / Credit Amt columns import instead of dropping every row", async () => {
  const txs = await parseCsv(`Date,Description,Debit Amt,Credit Amt,Balance
03/05/2026,NETFLIX.COM,649.00,,124351.00
01/05/2026,Salary Credit,,48000.00,125000.00
`);

  assert.equal(txs.length, 2);

  const netflix = txs.find((t) => t.merchant.includes("NETFLIX"));
  assert.ok(netflix, "expected NETFLIX.COM debit to import");
  assert.equal(netflix!.amount, 649);
  assert.equal(netflix!.type, "DEBIT");
  assert.equal(isoDay(netflix!.date), "2026-05-03");

  const salary = txs.find((t) => /salary/i.test(t.merchant));
  assert.ok(salary, "expected Salary Credit to import as CREDIT");
  assert.equal(salary!.amount, 48000);
  assert.equal(salary!.type, "CREDIT");
});

test("CSV Debit Amt. / Credit Amt. trailing periods still classify credits", async () => {
  const txs = await parseCsv(`Date,Narration,Debit Amt.,Credit Amt.,Balance
04/05/2026,SPOTIFY PREMIUM,119.00,,124232.00
01/05/2026,Salary Credit,,48000.00,125000.00
`);

  assert.equal(txs.length, 2);
  assert.match(txs[0]!.merchant, /SPOTIFY/i);
  assert.equal(txs[0]!.amount, 119);
  assert.equal(txs[0]!.type, "DEBIT");
  assert.equal(txs[1]!.type, "CREDIT");
  assert.equal(txs[1]!.amount, 48000);
});

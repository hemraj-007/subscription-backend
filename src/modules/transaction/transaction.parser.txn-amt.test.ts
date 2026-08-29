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
    `txn-amt-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
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

test("CSV Finacle Txn Amt column imports debit and credit amounts", async () => {
  const txs = await parseCsvText(
    [
      "Txn Date,Narration,Cheque No,Txn Amt,CR/DR,Balance",
      "03/05/2026,NETFLIX.COM,,649.00,DR,124351.00",
      "01/05/2026,Salary Credit,,48000.00,CR,125000.00",
    ].join("\n")
  );

  assert.equal(txs.length, 2);

  const netflix = find(txs, "NETFLIX");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.date.toISOString().slice(0, 10), "2026-05-03");

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
});

test("CSV Txn. Amt. punctuation still resolves the amount column", async () => {
  const txs = await parseCsvText(
    [
      "Date,Narration,Txn. Amt.,Balance",
      "03/05/2026,NETFLIX.COM,649.00,124351.00",
    ].join("\n")
  );

  assert.equal(txs.length, 1);
  assert.equal(find(txs, "NETFLIX").amount, 649);
});

test("CSV Tran Amt / Trn Amt headers import rows", async () => {
  const tran = await parseCsvText(
    [
      "Tran Date,Particulars,Tran Amt,Balance",
      "03/05/2026,SPOTIFY,119.00,1000.00",
    ].join("\n")
  );
  assert.equal(tran.length, 1);
  assert.equal(find(tran, "SPOTIFY").amount, 119);

  const trn = await parseCsvText(
    [
      "Date,Narration,Trn Amt,Balance",
      "04/05/2026,NETFLIX.COM,649.00,124351.00",
    ].join("\n")
  );
  assert.equal(trn.length, 1);
  assert.equal(find(trn, "NETFLIX").amount, 649);
});

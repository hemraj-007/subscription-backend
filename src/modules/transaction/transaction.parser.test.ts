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
    `stmt-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
  );
  await fs.promises.writeFile(filePath, csv, "utf8");
  try {
    return await parseCSV(filePath);
  } finally {
    await fs.promises.unlink(filePath).catch(() => undefined);
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

test("plural Withdrawals/Deposits CSV columns import debit and credit rows", async () => {
  const txs = await parseCsvText(`Date,Narration,Withdrawals,Deposits,Balance
02/05/2026,NETFLIX.COM,649.00,,50000.00
03/05/2026,Salary Credit,,48000.00,98000.00
`);

  assert.equal(txs.length, 2);

  const netflix = txs.find((t) => t.merchant.includes("NETFLIX"));
  assert.ok(netflix);
  assert.equal(netflix!.amount, 649);
  assert.equal(netflix!.type, "DEBIT");
  assert.equal(isoDay(netflix!.date), "2026-05-02");

  const salary = txs.find((t) => t.merchant.toLowerCase().includes("salary"));
  assert.ok(salary);
  assert.equal(salary!.amount, 48000);
  assert.equal(salary!.type, "CREDIT");
});

test("punctuated Withdrawal Amt. / Deposit Amt. headers resolve after normalization", async () => {
  const txs = await parseCsvText(`Date,Description,Withdrawal Amt.,Deposit Amt.,Balance
04/05/2026,Spotify Premium,119.00,,1000.00
05/05/2026,Refund,,50.00,1050.00
`);

  assert.equal(txs.length, 2);
  assert.equal(txs[0]!.merchant, "Spotify Premium");
  assert.equal(txs[0]!.amount, 119);
  assert.equal(txs[0]!.type, "DEBIT");
  assert.equal(txs[1]!.type, "CREDIT");
  assert.equal(txs[1]!.amount, 50);
});

test("Withdrawal Amt (INR) style bank headers import amounts", async () => {
  const txs = await parseCsvText(
    `Txn Date,Particulars,Withdrawal Amt (INR),Deposit Amt (INR),Balance
06/05/2026,Adobe Creative Cloud,1999.00,,20000.00
`
  );

  assert.equal(txs.length, 1);
  assert.equal(txs[0]!.amount, 1999);
  assert.equal(txs[0]!.type, "DEBIT");
  assert.equal(isoDay(txs[0]!.date), "2026-05-06");
});

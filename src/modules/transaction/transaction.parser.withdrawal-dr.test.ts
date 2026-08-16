import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { parseCSV } from "./transaction.parser";
import { parseTransactionsFromPdfContent } from "./statement-text.parser";
import { ParsedTransaction } from "./transaction.types";

async function parseCsvText(csv: string): Promise<ParsedTransaction[]> {
  const filePath = path.join(
    os.tmpdir(),
    `stmt-wdl-dr-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
  );
  await fs.promises.writeFile(filePath, csv, "utf8");
  try {
    return await parseCSV(filePath);
  } finally {
    await fs.promises.unlink(filePath).catch(() => undefined);
  }
}

function find(txs: ParsedTransaction[], merchantPart: string): ParsedTransaction {
  const match = txs.find((t) =>
    t.merchant.toLowerCase().includes(merchantPart.toLowerCase())
  );
  assert.ok(match, `expected a transaction matching "${merchantPart}"`);
  return match!;
}

test("CSV Withdrawal(Dr)/Deposit(Cr) columns import debits and credits", async () => {
  // Finacle / PSU exports (PNB, Canara, and Tally-style CSVs) label split
  // ledgers this way. Exact aliases for "withdrawal"/"deposit" miss the (Dr)/(Cr)
  // suffix, and /amount/i does not apply, so every row was dropped.
  const txs = await parseCsvText(`Date,Narration,Withdrawal(Dr),Deposit(Cr),Balance
03/05/2026,NETFLIX.COM,649.00,,124351.00
01/05/2026,Salary Credit,,48000.00,125000.00
`);

  assert.equal(txs.length, 2);

  const netflix = find(txs, "NETFLIX");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");
});

test("CSV Withdrawal (Dr)/Deposit (Cr) spaced headers import both sides", async () => {
  const txs = await parseCsvText(`Date,Narration,Withdrawal (Dr),Deposit (Cr),Closing Balance
03/05/2026,SPOTIFY PREMIUM,119.00,,124232.00
01/05/2026,SALARY CREDIT,,85000.00,209232.00
`);

  assert.equal(txs.length, 2);

  const spotify = find(txs, "SPOTIFY");
  assert.equal(spotify.amount, 119);
  assert.equal(spotify.type, "DEBIT");

  const salary = find(txs, "SALARY");
  assert.equal(salary.amount, 85000);
  assert.equal(salary.type, "CREDIT");
});

test("PDF header tables recognize Withdrawal(Dr)/Deposit(Cr) ledger columns", () => {
  const rows = [
    ["Date", "Narration", "Withdrawal(Dr)", "Deposit(Cr)", "Balance"],
    ["03/05/2026", "Netflix", "649", "", "124351"],
    ["01/05/2026", "Salary Credit", "", "48000", "125000"],
  ];
  const txs = parseTransactionsFromPdfContent("", rows);

  const netflix = find(txs, "Netflix");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");
});

test("PDF header tables recognize spaced Withdrawal (Dr)/Deposit (Cr) columns", () => {
  const rows = [
    ["Date", "Narration", "Withdrawal (Dr)", "Deposit (Cr)", "Closing Balance"],
    ["03/05/2026", "Spotify Premium", "119", "", "124232"],
    ["01/05/2026", "Salary Credit", "", "85000", "209232"],
  ];
  const txs = parseTransactionsFromPdfContent("", rows);

  const spotify = find(txs, "Spotify");
  assert.equal(spotify.amount, 119);
  assert.equal(spotify.type, "DEBIT");

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 85000);
  assert.equal(salary.type, "CREDIT");
});

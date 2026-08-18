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
    `stmt-debit-inr-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
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

test("CSV Debit (INR)/Credit (INR) columns import debits and credits", async () => {
  // Yes Bank / IDFC / custom Excel exports label split ledgers this way.
  // Exact aliases match "debit"/"credit" only, and /amount/i does not apply,
  // so every row was dropped.
  const txs = await parseCsvText(`Date,Narration,Debit (INR),Credit (INR),Balance
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

test("CSV Debit Amount (INR)/Credit Amount (INR) columns import both sides", async () => {
  const txs = await parseCsvText(
    `Date,Description,Debit Amount (INR),Credit Amount (INR),Closing Balance
03/05/2026,SPOTIFY PREMIUM,119.00,,124232.00
01/05/2026,SALARY CREDIT,,85000.00,209232.00
`
  );

  assert.equal(txs.length, 2);

  const spotify = find(txs, "SPOTIFY");
  assert.equal(spotify.amount, 119);
  assert.equal(spotify.type, "DEBIT");

  const salary = find(txs, "SALARY");
  assert.equal(salary.amount, 85000);
  assert.equal(salary.type, "CREDIT");
});

test("CSV Debit (Rs.)/Credit (Rs.) columns import both sides", async () => {
  const txs = await parseCsvText(`Date,Particulars,Debit (Rs.),Credit (Rs.),Balance
03/05/2026,NETFLIX.COM,649.00,,124351.00
01/05/2026,Salary Credit,,48000.00,125000.00
`);

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX").type, "DEBIT");
  assert.equal(find(txs, "Salary").type, "CREDIT");
  assert.equal(find(txs, "Salary").amount, 48000);
});

test("PDF header tables recognize Debit (INR)/Credit (INR) ledger columns", () => {
  const rows = [
    ["Date", "Narration", "Debit (INR)", "Credit (INR)", "Balance"],
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

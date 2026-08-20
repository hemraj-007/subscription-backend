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
    `stmt-txn-dt-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
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

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

test("CSV Txn Dt column imports debit and credit rows", async () => {
  // Finacle/CBS Excel exports use Txn Dt instead of Date. Aliases and /date/i
  // both miss "Dt", so every row was dropped as an invalid date.
  const txs = await parseCsvText(`Txn Dt,Narration,Debit,Credit,Balance
03/05/2026,NETFLIX.COM,649.00,,124351.00
01/05/2026,Salary Credit,,48000.00,125000.00
`);

  assert.equal(txs.length, 2);

  const netflix = find(txs, "NETFLIX");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");
  assert.equal(isoDay(netflix.date), "2026-05-03");

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");
  assert.equal(isoDay(salary.date), "2026-05-01");
});

test("CSV Value Dt column imports when it is the only date header", async () => {
  const txs = await parseCsvText(`Value Dt,Narration,Debit,Credit,Balance
03/05/2026,NETFLIX.COM,649.00,,124351.00
01/05/2026,Salary Credit,,48000.00,125000.00
`);

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX").type, "DEBIT");
  assert.equal(find(txs, "Salary").type, "CREDIT");
  assert.equal(find(txs, "Salary").amount, 48000);
});

test("CSV Txn. Dt (punctuated) column still parses dates", async () => {
  const txs = await parseCsvText(`Txn. Dt,Particulars,Debit,Credit,Balance
03/05/2026,NETFLIX.COM,649.00,,124351.00
`);

  assert.equal(txs.length, 1);
  assert.equal(find(txs, "NETFLIX").amount, 649);
  assert.equal(isoDay(find(txs, "NETFLIX").date), "2026-05-03");
});

test("CSV prefers Txn Dt over Value Dt when both are present", async () => {
  const txs = await parseCsvText(
    `Value Dt,Txn Dt,Narration,Debit,Credit,Balance
04/05/2026,03/05/2026,NETFLIX.COM,649.00,,124351.00
`
  );

  assert.equal(txs.length, 1);
  assert.equal(isoDay(find(txs, "NETFLIX").date), "2026-05-03");
});

test("PDF header tables recognize Txn Dt and keep credits as CREDIT", () => {
  const rows = [
    ["Txn Dt", "Narration", "Debit", "Credit", "Balance"],
    ["03/05/2026", "Netflix", "649", "", "124351"],
    ["01/05/2026", "Salary Credit", "", "48000", "125000"],
  ];
  const txs = parseTransactionsFromPdfContent("", rows);

  const netflix = find(txs, "Netflix");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");
  assert.equal(isoDay(netflix.date), "2026-05-03");

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");
});

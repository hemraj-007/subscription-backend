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
    `stmt-debits-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
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

test("CSV Debits/Credits columns import debits and credits", async () => {
  // Accounting and some bank exports use plural ledger headers.
  // Exact-match aliases for "debit"/"credit" miss these, so every row is dropped.
  const txs = await parseCsvText(`Date,Description,Debits,Credits,Balance
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

test("PDF header tables recognize Debits/Credits ledger columns", () => {
  const rows = [
    ["Date", "Description", "Debits", "Credits", "Balance"],
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

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
    `stmt-delim-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
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

function find(txs: ParsedTransaction[], merchantPart: string): ParsedTransaction {
  const match = txs.find((t) =>
    t.merchant.toLowerCase().includes(merchantPart.toLowerCase())
  );
  assert.ok(match, `expected a transaction matching "${merchantPart}"`);
  return match!;
}

test("semicolon-delimited bank CSV imports debit and credit rows", async () => {
  // Excel/EU locales and several bank portals export `;` instead of `,`.
  // csv-parse defaults to comma, so the whole row is one field and every
  // date/amount parse fails → imported: 0.
  const txs = await parseCsvText(`Date;Narration;Debit;Credit;Balance
03/05/2026;NETFLIX.COM;649.00;;124351.00
01/05/2026;Salary Credit;;48000.00;125000.00
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

test("tab-delimited statement exports import debit and credit rows", async () => {
  const txs = await parseCsvText(
    [
      "Date\tNarration\tDebit\tCredit\tBalance",
      "03/05/2026\tNETFLIX.COM\t649.00\t\t124351.00",
      "01/05/2026\tSalary Credit\t\t48000.00\t125000.00",
      "",
    ].join("\n")
  );

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX").type, "DEBIT");
  assert.equal(find(txs, "Salary").type, "CREDIT");
  assert.equal(find(txs, "Salary").amount, 48000);
});

test("comma-delimited CSV still imports (delimiter detection regression)", async () => {
  const txs = await parseCsvText(`Date,Narration,Debit,Credit,Balance
03/05/2026,NETFLIX.COM,649.00,,124351.00
01/05/2026,Salary Credit,,48000.00,125000.00
`);

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX").amount, 649);
  assert.equal(find(txs, "Salary").type, "CREDIT");
});

test("comma CSV with semicolon inside a quoted narration is not split", async () => {
  // Enabling `,` and `;` as simultaneous delimiters would cut UPI;NETFLIX in two.
  const txs = await parseCsvText(`Date,Narration,Debit,Credit,Balance
03/05/2026,"UPI;NETFLIX.COM",649.00,,124351.00
`);

  assert.equal(txs.length, 1);
  assert.equal(txs[0]!.merchant, "UPI;NETFLIX.COM");
  assert.equal(txs[0]!.amount, 649);
  assert.equal(txs[0]!.type, "DEBIT");
});

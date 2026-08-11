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
    `stmt-part-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
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

test("Transaction Particulars is used as merchant (not Date)", async () => {
  const txs = await parseCsvText(`Date,Transaction Particulars,Amount
01/05/2026,NETFLIX.COM,649.00
01/06/2026,NETFLIX.COM,649.00
`);

  assert.equal(txs.length, 2);
  assert.equal(txs[0]!.merchant, "NETFLIX.COM");
  assert.equal(txs[0]!.amount, 649);
  assert.equal(txs[0]!.type, "DEBIT");
  assert.equal(isoDay(txs[0]!.date), "2026-05-01");
  assert.notEqual(txs[0]!.merchant, "01/05/2026");
});

test("Chq/Ref No before Transaction Particulars does not become the merchant", async () => {
  // Common Axis/HDFC-style layout: Date, Chq/Ref No, Transaction Particulars, Amount.
  // Falling back to the first non-date column would store the cheque/ref number.
  const txs = await parseCsvText(`Date,Chq/Ref No,Transaction Particulars,Amount
01/05/2026,000123456789,NETFLIX.COM,649.00
01/06/2026,000123456790,NETFLIX.COM,649.00
`);

  assert.equal(txs.length, 2);
  assert.equal(txs[0]!.merchant, "NETFLIX.COM");
  assert.equal(txs[1]!.merchant, "NETFLIX.COM");
  assert.notEqual(txs[0]!.merchant, "000123456789");
  assert.notEqual(txs[0]!.merchant, "01/05/2026");
  assert.equal(txs[0]!.amount, 649);
  assert.equal(isoDay(txs[0]!.date), "2026-05-01");
});

test("Narrative column maps to merchant", async () => {
  const txs = await parseCsvText(`Date,Narrative,Amount
02/05/2026,Amazon Prime,1499
`);

  assert.equal(txs.length, 1);
  assert.equal(txs[0]!.merchant, "Amazon Prime");
  assert.equal(txs[0]!.amount, 1499);
  assert.equal(isoDay(txs[0]!.date), "2026-05-02");
  assert.notEqual(txs[0]!.merchant, "02/05/2026");
});

test("Payee Name column maps to merchant", async () => {
  const txs = await parseCsvText(`Date,Payee Name,Amount
03/05/2026,Adobe Creative Cloud,1999.00
`);

  assert.equal(txs.length, 1);
  assert.equal(txs[0]!.merchant, "Adobe Creative Cloud");
  assert.equal(txs[0]!.amount, 1999);
  assert.notEqual(txs[0]!.merchant, "03/05/2026");
});

test("unknown description column preferred over Ref No fallback", async () => {
  const txs = await parseCsvText(`Date,Ref No,Vendor Detail,Amount
04/05/2026,998877,Spotify Premium,119.00
`);

  assert.equal(txs.length, 1);
  assert.equal(txs[0]!.merchant, "Spotify Premium");
  assert.notEqual(txs[0]!.merchant, "998877");
  assert.notEqual(txs[0]!.merchant, "04/05/2026");
});

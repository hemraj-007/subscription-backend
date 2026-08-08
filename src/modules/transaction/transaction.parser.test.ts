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

test("Remarks column is used as merchant (not Date fallback)", async () => {
  const txs = await parseCsvText(`Date,Remarks,Amount
01/05/2026,NETFLIX.COM,649.00
01/06/2026,NETFLIX.COM,649.00
`);

  assert.equal(txs.length, 2);
  assert.equal(txs[0]!.merchant, "NETFLIX.COM");
  assert.equal(txs[0]!.amount, 649);
  assert.equal(txs[0]!.type, "DEBIT");
  assert.equal(isoDay(txs[0]!.date), "2026-05-01");
  assert.equal(txs[1]!.merchant, "NETFLIX.COM");
  // Must not store the date string as the merchant — that prevents grouping.
  assert.notEqual(txs[0]!.merchant, "01/05/2026");
});

test("Transaction Remarks column maps to merchant", async () => {
  const txs = await parseCsvText(`Transaction Date,Transaction Remarks,Amount
02/05/2026,Amazon Prime,1499
02/06/2026,Amazon Prime,1499
`);

  assert.equal(txs.length, 2);
  assert.equal(txs[0]!.merchant, "Amazon Prime");
  assert.equal(txs[0]!.amount, 1499);
  assert.equal(isoDay(txs[0]!.date), "2026-05-02");
});

test("Memo column maps to merchant", async () => {
  const txs = await parseCsvText(`Date,Memo,Amount
03/05/2026,Spotify Premium,119.00
`);

  assert.equal(txs.length, 1);
  assert.equal(txs[0]!.merchant, "Spotify Premium");
  assert.equal(txs[0]!.amount, 119);
});

test("unknown merchant header still preferred over Date/Amount fallback", async () => {
  const txs = await parseCsvText(`Date,Payee Name Detail,Amount
04/05/2026,Adobe Creative Cloud,1999.00
`);

  assert.equal(txs.length, 1);
  assert.equal(txs[0]!.merchant, "Adobe Creative Cloud");
  assert.notEqual(txs[0]!.merchant, "04/05/2026");
});

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
    `stmt-ledger-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
  );
  fs.writeFileSync(filePath, csv);
  try {
    return await parseCSV(filePath);
  } finally {
    fs.unlinkSync(filePath);
  }
}

function find(txs: ParsedTransaction[], merchant: string): ParsedTransaction {
  const match = txs.find((t) => t.merchant === merchant);
  assert.ok(match, `expected a transaction for "${merchant}"`);
  return match!;
}

test("CSV opening/closing balance rows are not imported as charges", async () => {
  const txs = await parseCsvText(
    [
      "Date,Description,Amount",
      "01/05/2026,Opening Balance,15000.00",
      "03/05/2026,NETFLIX.COM,649.00",
      "05/05/2026,PAYMENT - THANK YOU,-5000.00",
      "31/05/2026,Closing Balance,10649.00",
    ].join("\n")
  );

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX.COM").amount, 649);
  assert.equal(find(txs, "NETFLIX.COM").type, "DEBIT");
  assert.equal(find(txs, "PAYMENT - THANK YOU").amount, 5000);
  assert.equal(find(txs, "PAYMENT - THANK YOU").type, "CREDIT");
  assert.equal(
    txs.some((t) => /opening|closing/i.test(t.merchant)),
    false
  );
});

test("CSV opening/closing bal abbreviations and previous balance are skipped", async () => {
  const txs = await parseCsvText(
    [
      "Date,Description,Amount",
      "01/05/2026,Opening Bal,15000.00",
      "01/05/2026,Previous Balance,12451.00",
      "03/05/2026,NETFLIX.COM,649.00",
      "31/05/2026,Closing Bal.,13100.00",
      "31/05/2026,Outstanding Balance,13100.00",
    ].join("\n")
  );

  assert.equal(txs.length, 1);
  assert.equal(find(txs, "NETFLIX.COM").amount, 649);
});

test("CSV brought/carried forward and B/F C/F rows are skipped", async () => {
  const txs = await parseCsvText(
    [
      "Date,Narration,Debit,Credit,Balance",
      "01/05/2026,Brought Forward,,15000.00,15000.00",
      "03/05/2026,NETFLIX.COM,649.00,,14351.00",
      "01/05/2026,Salary Credit,,48000.00,62351.00",
      "31/05/2026,Carried Forward,,62351.00,62351.00",
    ].join("\n")
  );

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX.COM").type, "DEBIT");
  assert.equal(find(txs, "NETFLIX.COM").amount, 649);
  assert.equal(find(txs, "Salary Credit").type, "CREDIT");
  assert.equal(find(txs, "Salary Credit").amount, 48000);
});

test("CSV B/F and C/F passbook rows are skipped", async () => {
  const txs = await parseCsvText(
    [
      "Date,Description,Amount",
      "01/05/2026,B/F,15000.00",
      "03/05/2026,Spotify Premium,119.00",
      "31/05/2026,C/F,15119.00",
    ].join("\n")
  );

  assert.equal(txs.length, 1);
  assert.equal(find(txs, "Spotify Premium").amount, 119);
});

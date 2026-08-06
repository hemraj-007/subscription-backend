import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { parseCSV } from "./transaction.parser";
import { ParsedTransaction } from "./transaction.types";

async function parse(csv: string): Promise<ParsedTransaction[]> {
  const filePath = path.join(
    os.tmpdir(),
    `csv-type-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
  );
  fs.writeFileSync(filePath, csv, "utf8");
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

test("CSV Type column marks Cr rows as CREDIT and Dr as DEBIT", async () => {
  const txs = await parse(`Date,Description,Amount,Type,Balance
01/05/2026,NEFT Salary,48000,Cr,125000
03/05/2026,Netflix Subscription,649,Dr,124351
`);

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");

  const netflix = find(txs, "Netflix");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");
});

test("CSV Dr/Cr column classifies CR/DR direction", async () => {
  const txs = await parse(`Transaction Date,Narration,Amount (INR),Dr/Cr
01/05/2026,Salary Credit,48000,CR
03/05/2026,Spotify Premium,119,DR
`);

  const salary = find(txs, "Salary");
  assert.equal(salary.type, "CREDIT");
  assert.equal(salary.amount, 48000);

  const spotify = find(txs, "Spotify");
  assert.equal(spotify.type, "DEBIT");
  assert.equal(spotify.amount, 119);
});

test("CSV signed single Amount column treats + as CREDIT", async () => {
  const txs = await parse(`Date,Description,Amount
01/05/2026,Salary,+48000
03/05/2026,Netflix,-649
`);

  const salary = find(txs, "Salary");
  assert.equal(salary.type, "CREDIT");
  assert.equal(salary.amount, 48000);

  const netflix = find(txs, "Netflix");
  assert.equal(netflix.type, "DEBIT");
  assert.equal(netflix.amount, 649);
});

test("CSV amount cells with trailing CR/DR set direction", async () => {
  const txs = await parse(`Date,Description,Amount
01/05/2026,Payment Received,5000.00 CR
03/05/2026,Netflix,649.00 DR
`);

  const payment = find(txs, "Payment");
  assert.equal(payment.type, "CREDIT");
  assert.equal(payment.amount, 5000);

  const netflix = find(txs, "Netflix");
  assert.equal(netflix.type, "DEBIT");
  assert.equal(netflix.amount, 649);
});

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
    `stmt-rs-prefix-${Date.now()}-${Math.random().toString(16).slice(2)}.csv`
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

test("CSV Rs. prefixed amounts are not dropped or truncated", async () => {
  const txs = await parseCsvText(
    [
      "Date,Description,Amount",
      "03/05/2026,NETFLIX.COM,Rs. 649.00",
      "04/05/2026,Spotify Premium,Rs. 119",
      "05/05/2026,YouTube Premium,Rs.1,299.00",
    ].join("\n")
  );

  assert.equal(txs.length, 3);
  assert.equal(find(txs, "NETFLIX.COM").amount, 649);
  assert.equal(find(txs, "NETFLIX.COM").type, "DEBIT");
  assert.equal(find(txs, "Spotify Premium").amount, 119);
  assert.equal(find(txs, "YouTube Premium").amount, 1299);
});

test("CSV debit/credit columns with Rs. prefixes keep direction", async () => {
  const txs = await parseCsvText(
    [
      "Date,Narration,Debit,Credit,Balance",
      "03/05/2026,NETFLIX.COM,Rs. 649.00,,124351.00",
      "01/05/2026,Salary Credit,,Rs. 48,000.00,125000.00",
    ].join("\n")
  );

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX.COM").type, "DEBIT");
  assert.equal(find(txs, "NETFLIX.COM").amount, 649);
  assert.equal(find(txs, "Salary Credit").type, "CREDIT");
  assert.equal(find(txs, "Salary Credit").amount, 48000);
});

test("CSV INR and rupee-symbol prefixes still parse", async () => {
  const txs = await parseCsvText(
    [
      "Date,Description,Amount",
      "03/05/2026,NETFLIX.COM,₹649.00",
      "04/05/2026,Spotify Premium,INR 119.00",
    ].join("\n")
  );

  assert.equal(txs.length, 2);
  assert.equal(find(txs, "NETFLIX.COM").amount, 649);
  assert.equal(find(txs, "Spotify Premium").amount, 119);
});

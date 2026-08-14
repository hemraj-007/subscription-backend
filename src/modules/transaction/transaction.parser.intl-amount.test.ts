import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { parseCSV } from "./transaction.parser";
import { parseTransactionsFromPdfContent } from "./statement-text.parser";
import { ParsedTransaction } from "./transaction.types";

function find(txs: ParsedTransaction[], merchantPart: string): ParsedTransaction {
  const match = txs.find((t) =>
    t.merchant.toLowerCase().includes(merchantPart.toLowerCase())
  );
  assert.ok(match, `expected a transaction matching "${merchantPart}"`);
  return match!;
}

async function parseCsvString(csv: string): Promise<ParsedTransaction[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stmt-intl-"));
  const filePath = path.join(dir, "statement.csv");
  fs.writeFileSync(filePath, csv);
  try {
    return await parseCSV(filePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("CSV prefers Amount (INR) over a leading Intl. Amount column", async () => {
  const txs = await parseCsvString(
    [
      "Date,Transaction Details,Reward Points,Intl. Amount,Amount (INR)",
      "03/05/2026,Netflix,10,,649",
      "01/05/2026,Spotify,5,0,119",
      "10/05/2026,Adobe Creative Cloud,0,24.48,1787",
    ].join("\n")
  );

  assert.equal(txs.length, 3);
  assert.equal(find(txs, "Netflix").amount, 649);
  assert.equal(find(txs, "Spotify").amount, 119);
  // Must use billed INR, not the USD/forex cell.
  assert.equal(find(txs, "Adobe").amount, 1787);
});

test("CSV still parses a single Amount column", async () => {
  const txs = await parseCsvString(
    ["Date,Description,Amount", "03/05/2026,Netflix,649"].join("\n")
  );
  assert.equal(txs.length, 1);
  assert.equal(find(txs, "Netflix").amount, 649);
});

test("PDF header table prefers Amount (INR) over Intl. Amount", () => {
  const rows = [
    ["Date", "Transaction Details", "Reward Points", "Intl. Amount", "Amount (INR)"],
    ["03/05/2026", "Netflix", "10", "", "649"],
    ["10/05/2026", "Adobe Creative Cloud", "0", "24.48", "1787"],
  ];
  const txs = parseTransactionsFromPdfContent("", rows);

  assert.equal(find(txs, "Netflix").amount, 649);
  assert.equal(find(txs, "Adobe").amount, 1787);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { parseCSV } from "./transaction.parser";

async function withCsv(
  headers: string[],
  rows: string[][],
  run: (filePath: string) => Promise<void>
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amount-dr-csv-"));
  const filePath = path.join(dir, "statement.csv");
  const lines = [headers.join(","), ...rows.map((r) => r.join(","))];
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  try {
    await run(filePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("CSV Amount (Dr)/(Cr) columns classify credits correctly", async () => {
  await withCsv(
    ["Date", "Description", "Amount (Dr)", "Amount (Cr)", "Balance"],
    [
      ["03/05/2026", "Netflix", "649", "", "124351"],
      ["01/05/2026", "Salary", "", "48000", "125000"],
    ],
    async (filePath) => {
      const txs = await parseCSV(filePath);
      assert.equal(txs.length, 2);

      const netflix = txs.find((t) => t.merchant.includes("Netflix"));
      assert.ok(netflix);
      assert.equal(netflix!.amount, 649);
      assert.equal(netflix!.type, "DEBIT");

      const salary = txs.find((t) => t.merchant.includes("Salary"));
      assert.ok(salary);
      assert.equal(salary!.amount, 48000);
      assert.equal(salary!.type, "CREDIT");
    }
  );
});

test("CSV Amt Dr/Amt Cr columns import debit and credit rows", async () => {
  await withCsv(
    ["Date", "Description", "Amt Dr", "Amt Cr", "Balance"],
    [
      ["03/05/2026", "Spotify", "119", "", "10000"],
      ["02/05/2026", "Refund", "", "500", "10500"],
    ],
    async (filePath) => {
      const txs = await parseCSV(filePath);
      assert.equal(txs.length, 2);

      const spotify = txs.find((t) => t.merchant.includes("Spotify"));
      assert.ok(spotify);
      assert.equal(spotify!.type, "DEBIT");
      assert.equal(spotify!.amount, 119);

      const refund = txs.find((t) => t.merchant.includes("Refund"));
      assert.ok(refund);
      assert.equal(refund!.type, "CREDIT");
      assert.equal(refund!.amount, 500);
    }
  );
});

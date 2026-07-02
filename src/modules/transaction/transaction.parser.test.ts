import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { parseCSV } from "./transaction.parser";

async function withCsv<T>(content: string, run: (filePath: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "statement-csv-"));
  const filePath = path.join(dir, "statement.csv");
  await fs.writeFile(filePath, content);

  try {
    return await run(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("single signed amount CSV columns preserve debit and credit direction", async () => {
  await withCsv(
    [
      "Description,Amount,Date",
      "Netflix,-649,03/05/2026",
      "Salary,+48000,01/05/2026",
    ].join("\n"),
    async (filePath) => {
      const txs = await parseCSV(filePath);

      assert.equal(txs.length, 2);
      assert.equal(txs[0]!.merchant, "Netflix");
      assert.equal(txs[0]!.amount, 649);
      assert.equal(txs[0]!.type, "DEBIT");
      assert.equal(txs[1]!.merchant, "Salary");
      assert.equal(txs[1]!.amount, 48000);
      assert.equal(txs[1]!.type, "CREDIT");
    }
  );
});

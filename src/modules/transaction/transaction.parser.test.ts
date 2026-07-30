import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseCSV } from "./transaction.parser";

async function writeTempCsv(content: string): Promise<{ file: string; dir: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "subscription-csv-"));
  const file = path.join(dir, "statement.csv");
  await writeFile(file, content);
  return { file, dir };
}

test("single amount CSV treats negative and parenthesized amounts as debits", async (t) => {
  const { file, dir } = await writeTempCsv(
    [
      "Date,Merchant,Amount",
      "03/05/2026,Netflix,-649",
      "04/05/2026,Spotify,(119)",
      "01/05/2026,Salary,+48000",
    ].join("\n")
  );
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const txs = await parseCSV(file);

  const netflix = txs.find((tx) => tx.merchant === "Netflix");
  assert.ok(netflix);
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");

  const spotify = txs.find((tx) => tx.merchant === "Spotify");
  assert.ok(spotify);
  assert.equal(spotify.amount, 119);
  assert.equal(spotify.type, "DEBIT");

  const salary = txs.find((tx) => tx.merchant === "Salary");
  assert.ok(salary);
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");
});

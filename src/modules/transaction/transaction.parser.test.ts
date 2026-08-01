import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";

import { parseCSV } from "./transaction.parser";

async function parseCsvContents(contents: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stmt-csv-"));
  const file = path.join(dir, "statement.csv");
  try {
    fs.writeFileSync(file, contents);
    return await parseCSV(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

test("day-first CSV dates with posting times keep the statement calendar day", async () => {
  const txs = await parseCsvContents(
    [
      "Date,Description,Amount",
      "02/05/2026 10:00,Netflix,649",
      "02/05/2026 10:00:00,Spotify Premium,119",
      "13/05/2026 10:00,YouTube Premium,149",
      "02-May-2026 09:30,Disney Plus,199",
    ].join("\n")
  );

  assert.equal(txs.length, 4);

  const byMerchant = new Map(txs.map((t) => [t.merchant, t]));
  assert.equal(isoDay(byMerchant.get("Netflix")!.date), "2026-05-02");
  assert.equal(isoDay(byMerchant.get("Spotify Premium")!.date), "2026-05-02");
  assert.equal(isoDay(byMerchant.get("YouTube Premium")!.date), "2026-05-13");
  assert.equal(isoDay(byMerchant.get("Disney Plus")!.date), "2026-05-02");
});

test("date-only day-first CSV rows remain unchanged", async () => {
  const txs = await parseCsvContents(
    ["Date,Description,Amount", "02/05/2026,Netflix,649", "13/05/2026,Spotify,119"].join(
      "\n"
    )
  );

  assert.equal(txs.length, 2);
  assert.equal(isoDay(txs[0]!.date), "2026-05-02");
  assert.equal(isoDay(txs[1]!.date), "2026-05-13");
});

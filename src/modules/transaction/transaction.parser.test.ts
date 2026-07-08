import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCSV } from "./transaction.parser";

test("CSV single amount signs classify money out and money in", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "subscription-csv-"));
  const file = path.join(dir, "statement.csv");

  try {
    await writeFile(
      file,
      [
        "date,description,amount",
        "2026-05-03,Netflix,-649",
        "2026-05-03,Netflix,+649",
        "2026-05-04,Spotify,119",
        "",
      ].join("\n")
    );

    const txs = await parseCSV(file);
    assert.equal(txs.length, 3);

    const netflix = txs.filter((t) => t.merchant === "Netflix");
    assert.deepEqual(
      netflix.map((t) => t.type).sort(),
      ["CREDIT", "DEBIT"]
    );

    const spotify = txs.find((t) => t.merchant === "Spotify");
    assert.equal(spotify?.type, "DEBIT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

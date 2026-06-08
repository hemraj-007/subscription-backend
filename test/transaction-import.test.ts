import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { prisma } from "../src/config/prisma";
import { parseTransactionsFromPdfContent } from "../src/modules/transaction/statement-text.parser";
import { parseCSV } from "../src/modules/transaction/transaction.parser";
import { transactionService } from "../src/modules/transaction/transaction.service";

after(async () => {
  await prisma.$disconnect();
});

test("CSV parsing preserves legitimate duplicate-looking statement rows", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "statement-csv-"));
  const filePath = path.join(dir, "statement.csv");
  await fs.writeFile(
    filePath,
    [
      "merchant,amount,date",
      "Coffee Shop,5.00,2026-01-01",
      "Coffee Shop,5.00,2026-01-01",
    ].join("\n")
  );

  const parsed = await parseCSV(filePath);

  assert.equal(parsed.length, 2);
  assert.deepEqual(
    parsed.map((tx) => [tx.merchant, tx.amount, tx.date.toISOString().slice(0, 10)]),
    [
      ["Coffee Shop", 5, "2026-01-01"],
      ["Coffee Shop", 5, "2026-01-01"],
    ]
  );
});

test("PDF table parsing preserves legitimate duplicate-looking statement rows", () => {
  const parsed = parseTransactionsFromPdfContent("", [
    ["Date", "Description", "Debit", "Balance"],
    ["01-Jan-2026", "Coffee Shop", "5.00", "100.00"],
    ["01-Jan-2026", "Coffee Shop", "5.00", "95.00"],
  ]);

  assert.equal(parsed.length, 2);
  assert.deepEqual(
    parsed.map((tx) => [tx.merchant, tx.amount, tx.date.toISOString().slice(0, 10)]),
    [
      ["Coffee Shop", 5, "2026-01-01"],
      ["Coffee Shop", 5, "2026-01-01"],
    ]
  );
});

test("transaction save path does not skip duplicate-looking rows", async (t) => {
  const createMany = t.mock.method(prisma.transaction, "createMany", async (args: any) => {
    assert.equal("skipDuplicates" in args, false);
    assert.deepEqual(args.data, [
      {
        cardId: "card-1",
        merchant: "Coffee Shop",
        amount: 5,
        date: new Date("2026-01-01T00:00:00Z"),
      },
      {
        cardId: "card-1",
        merchant: "Coffee Shop",
        amount: 5,
        date: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    return { count: 2 };
  });

  const result = await transactionService.saveTransactions("card-1", [
    {
      merchant: "Coffee Shop",
      amount: 5,
      date: new Date("2026-01-01T00:00:00Z"),
    },
    {
      merchant: "Coffee Shop",
      amount: 5,
      date: new Date("2026-01-01T00:00:00Z"),
    },
  ]);

  assert.equal(createMany.mock.calls.length, 1);
  assert.deepEqual(result, { inserted: 2, skipped: 0 });
});

const assert = require("node:assert/strict");
const test = require("node:test");

const { prisma } = require("../dist/config/prisma");
const { transactionService } = require("../dist/modules/transaction/transaction.service");

test("saveTransactions preserves legitimate identical same-day charges", async (t) => {
  const originalCreateMany = prisma.transaction.createMany;
  let createManyArgs;

  prisma.transaction.createMany = async (args) => {
    createManyArgs = args;
    return { count: args.data.length };
  };
  t.after(() => {
    prisma.transaction.createMany = originalCreateMany;
  });

  const date = new Date("2026-06-01T00:00:00.000Z");
  const result = await transactionService.saveTransactions("card-1", [
    { merchant: "COFFEE SHOP", amount: 4.5, date },
    { merchant: "COFFEE SHOP", amount: 4.5, date },
  ]);

  assert.equal(result.inserted, 2);
  assert.equal(result.skipped, 0);
  assert.equal(createManyArgs.skipDuplicates, undefined);
  assert.deepEqual(createManyArgs.data, [
    {
      cardId: "card-1",
      merchant: "COFFEE SHOP",
      amount: 4.5,
      date,
    },
    {
      cardId: "card-1",
      merchant: "COFFEE SHOP",
      amount: 4.5,
      date,
    },
  ]);
});

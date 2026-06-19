const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");

process.env.DATABASE_URL ||= "postgresql://user:pass@localhost:5432/test";
process.env.JWT_SECRET ||= "test-secret";

const { authMiddleware } = require("../dist/middlewares/auth.middleware");
const {
  parseCSV,
  parseStatement,
} = require("../dist/modules/transaction/transaction.parser");
const { detectUnusedSubscriptions } = require("../dist/jobs/unusedSubscription.job");
const { prisma } = require("../dist/config/prisma");

after(async () => {
  await prisma.$disconnect();
});

function runAuthMiddleware(token) {
  return new Promise((resolve) => {
    const req = {
      headers: {
        authorization: token ? `Bearer ${token}` : undefined,
      },
    };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ nextCalled: false, statusCode: this.statusCode, payload, req });
        return this;
      },
    };

    authMiddleware(req, res, () => {
      resolve({ nextCalled: true, statusCode: res.statusCode, req });
    });
  });
}

test("auth middleware rejects signed JWTs without a userId claim", async () => {
  const token = jwt.sign({}, process.env.JWT_SECRET);

  const result = await runAuthMiddleware(token);

  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.payload, { message: "Invalid token" });
});

test("auth middleware accepts signed JWTs with a non-empty userId claim", async () => {
  const token = jwt.sign({ userId: "user-123" }, process.env.JWT_SECRET);

  const result = await runAuthMiddleware(token);

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.userId, "user-123");
});

test("CSV parser handles day-first statement dates and ignores running balance", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "statement-"));
  const file = path.join(dir, "statement.csv");
  await fs.writeFile(
    file,
    [
      "Date,Narration,Debit,Balance",
      "31/01/2026,NETFLIX.COM 866-716-0414,649,10000",
      "05/12/2025,SPOTIFY PREMIUM,119,9881",
      "",
    ].join("\n")
  );

  const transactions = await parseCSV(file);

  assert.equal(transactions.length, 2);
  assert.equal(transactions[0].amount, 649);
  assert.equal(transactions[0].date.getFullYear(), 2026);
  assert.equal(transactions[0].date.getMonth(), 0);
  assert.equal(transactions[0].date.getDate(), 31);
  assert.equal(transactions[1].date.getMonth(), 11);
  assert.equal(transactions[1].date.getDate(), 5);
});

test("CSV statement upload errors when only balance rows are present", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "statement-"));
  const file = path.join(dir, "balance-only.csv");
  await fs.writeFile(
    file,
    [
      "Date,Narration,Balance",
      "31/01/2026,Opening Balance,10000",
      "",
    ].join("\n")
  );

  await assert.rejects(
    () => parseStatement(file, "balance-only.csv", "text/csv"),
    /No transactions found in CSV/
  );
});

test("unused-subscription job matches normalized subscription merchants to raw transactions", async () => {
  const originals = {
    subscriptionFindMany: prisma.subscription.findMany,
    subscriptionUpdateMany: prisma.subscription.updateMany,
    transactionFindMany: prisma.transaction.findMany,
    alertFindMany: prisma.alert.findMany,
    alertCreateMany: prisma.alert.createMany,
  };
  let updateManyCalls = 0;
  let createManyCalls = 0;

  prisma.subscription.findMany = async () => [
    {
      id: "sub-1",
      userId: "user-1",
      cardId: "card-1",
      merchant: "Netflix",
    },
  ];
  prisma.transaction.findMany = async () => [
    {
      cardId: "card-1",
      merchant: "NETFLIX.COM 866-716-0414",
      date: new Date(),
    },
  ];
  prisma.alert.findMany = async () => [];
  prisma.subscription.updateMany = async () => {
    updateManyCalls += 1;
    return { count: 1 };
  };
  prisma.alert.createMany = async () => {
    createManyCalls += 1;
    return { count: 1 };
  };

  try {
    await detectUnusedSubscriptions();
  } finally {
    prisma.subscription.findMany = originals.subscriptionFindMany;
    prisma.subscription.updateMany = originals.subscriptionUpdateMany;
    prisma.transaction.findMany = originals.transactionFindMany;
    prisma.alert.findMany = originals.alertFindMany;
    prisma.alert.createMany = originals.alertCreateMany;
  }

  assert.equal(updateManyCalls, 0);
  assert.equal(createManyCalls, 0);
});

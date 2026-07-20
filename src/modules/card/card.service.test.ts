import assert from "node:assert/strict";
import test from "node:test";
import { Plan, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { PlanLimitError } from "../plan/plan.errors";
import { cardService } from "./card.service";

const user = {
  id: "user-1",
  email: "free@example.com",
  plan: Plan.FREE,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

test("creates cards using a serializable limit-check transaction", async () => {
  const originalTransaction = prisma.$transaction;
  let isolationLevel: Prisma.TransactionIsolationLevel | undefined;
  let createCalls = 0;

  (prisma as any).$transaction = async (
    callback: (tx: any) => Promise<unknown>,
    options: { isolationLevel?: Prisma.TransactionIsolationLevel }
  ) => {
    isolationLevel = options.isolationLevel;
    return callback({
      user: { findUnique: async () => user },
      creditCard: {
        count: async () => 0,
        create: async ({ data }: any) => {
          createCalls++;
          return { id: "card-1", ...data };
        },
      },
    });
  };

  try {
    const card = await cardService.createCard(user.id, { last4: "1234" });

    assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
    assert.equal(createCalls, 1);
    assert.equal(card.id, "card-1");
  } finally {
    (prisma as any).$transaction = originalTransaction;
  }
});

test("rechecks the limit after a serialization conflict", async () => {
  const originalTransaction = prisma.$transaction;
  let transactionCalls = 0;
  let createCalls = 0;

  (prisma as any).$transaction = async (
    callback: (tx: any) => Promise<unknown>
  ) => {
    transactionCalls++;
    if (transactionCalls === 1) {
      throw new Prisma.PrismaClientKnownRequestError("write conflict", {
        code: "P2034",
        clientVersion: "5.22.0",
      });
    }

    return callback({
      user: { findUnique: async () => user },
      creditCard: {
        count: async () => 1,
        create: async () => {
          createCalls++;
          return {};
        },
      },
    });
  };

  try {
    await assert.rejects(
      cardService.createCard(user.id, { last4: "1234" }),
      PlanLimitError
    );
    assert.equal(transactionCalls, 2);
    assert.equal(createCalls, 0);
  } finally {
    (prisma as any).$transaction = originalTransaction;
  }
});

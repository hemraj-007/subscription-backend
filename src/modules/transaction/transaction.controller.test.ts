import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.middleware";

// Controller imports pull in prisma/env; set placeholders before requiring.
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { transactionController } =
  require("./transaction.controller") as typeof import("./transaction.controller");

async function withTempUpload(
  run: (filePath: string) => Promise<void>
): Promise<void> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "subscription-guardian-upload-test-")
  );
  const filePath = path.join(dir, "statement.csv");
  await fs.writeFile(filePath, "date,merchant,amount\n2026-05-01,Netflix,649\n");
  try {
    await run(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function mockRes() {
  const state: { statusCode: number; body: unknown } = {
    statusCode: 0,
    body: undefined,
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

test("upload deletes temp file when cardId is missing", async () => {
  await withTempUpload(async (filePath) => {
    const { res, state } = mockRes();
    const req = {
      userId: "user-1",
      body: {},
      query: {},
      file: {
        path: filePath,
        originalname: "statement.csv",
        mimetype: "text/csv",
      },
    } as unknown as AuthRequest;

    await transactionController.upload(req, res);

    assert.equal(state.statusCode, 400);
    assert.deepEqual(state.body, { message: "Missing cardId" });
    await assert.rejects(() => fs.access(filePath), { code: "ENOENT" });
  });
});

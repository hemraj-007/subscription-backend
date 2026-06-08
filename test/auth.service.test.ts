import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import bcrypt from "bcrypt";

let prisma: typeof import("../src/config/prisma").prisma;
let authService: typeof import("../src/modules/auth/auth.service").authService;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://user:pass@localhost:5432/test";
  process.env.JWT_SECRET ||= "test-secret";
  process.env.JWT_EXPIRES_IN ||= "1h";

  ({ prisma } = await import("../src/config/prisma"));
  ({ authService } = await import("../src/modules/auth/auth.service"));
});

after(async () => {
  await prisma.$disconnect();
});

test("login accepts a legacy mixed-case stored email", async (t) => {
  const hashedPassword = await bcrypt.hash("correct-password", 4);
  const legacyUser = {
    id: "user-1",
    email: "Alice@Example.com",
    password: hashedPassword,
    plan: "FREE",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };

  const originalUserDelegate = prisma.user;
  let findManyCalls = 0;
  (prisma as any).user = {
    findMany: async (args: any) => {
      findManyCalls += 1;
      assert.deepEqual(args.where, {
        email: { equals: "alice@example.com", mode: "insensitive" },
      });
      assert.deepEqual(args.orderBy, { createdAt: "asc" });
      return [legacyUser];
    },
  };
  t.after(() => {
    (prisma as any).user = originalUserDelegate;
  });

  const result = await authService.login(" alice@example.com ", "correct-password");

  assert.equal(findManyCalls, 1);
  assert.equal(result.user.id, "user-1");
  assert.equal(result.user.email, "Alice@Example.com");
  assert.equal("password" in result.user, false);
  assert.match(result.token, /^[^.]+\.[^.]+\.[^.]+$/);
});

test("signup blocks duplicate emails regardless of case", async (t) => {
  const originalUserDelegate = prisma.user;
  let findFirstCalls = 0;
  (prisma as any).user = {
    findFirst: async (args: any) => {
      findFirstCalls += 1;
      assert.deepEqual(args.where, {
        email: { equals: "alice@example.com", mode: "insensitive" },
      });
      assert.deepEqual(args.select, { id: true });
      return { id: "existing-user" };
    },
  };
  t.after(() => {
    (prisma as any).user = originalUserDelegate;
  });

  await assert.rejects(
    () => authService.signup("ALICE@example.com", "password"),
    /User already exists/
  );
  assert.equal(findFirstCalls, 1);
});

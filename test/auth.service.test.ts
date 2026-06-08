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

  const findMany = t.mock.method(prisma.user, "findMany", async (args: any) => {
    assert.deepEqual(args.where, {
      email: { equals: "alice@example.com", mode: "insensitive" },
    });
    assert.deepEqual(args.orderBy, { createdAt: "asc" });
    return [legacyUser];
  });

  const result = await authService.login(" alice@example.com ", "correct-password");

  assert.equal(findMany.mock.calls.length, 1);
  assert.equal(result.user.id, "user-1");
  assert.equal(result.user.email, "Alice@Example.com");
  assert.equal("password" in result.user, false);
  assert.match(result.token, /^[^.]+\.[^.]+\.[^.]+$/);
});

test("signup blocks duplicate emails regardless of case", async (t) => {
  const findFirst = t.mock.method(prisma.user, "findFirst", async (args: any) => {
    assert.deepEqual(args.where, {
      email: { equals: "alice@example.com", mode: "insensitive" },
    });
    assert.deepEqual(args.select, { id: true });
    return { id: "existing-user" };
  });

  await assert.rejects(
    () => authService.signup("ALICE@example.com", "password"),
    /User already exists/
  );
  assert.equal(findFirst.mock.calls.length, 1);
});

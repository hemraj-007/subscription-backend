import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const SALT_ROUNDS = 10;
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const emailEquals = (email: string) => ({
  equals: email,
  mode: "insensitive" as const,
});

async function findUsersByEmail(email: string) {
  return prisma.user.findMany({
    where: {
      email: emailEquals(email),
    },
    orderBy: { createdAt: "asc" },
  });
}

const signToken = (userId: string) => {
  return jwt.sign(
    { userId },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
  );
};

export const authService = {
  async signup(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);

    const [existingUser] = await findUsersByEmail(normalizedEmail);

    if (existingUser) {
      throw new Error("User already exists");
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: { email: normalizedEmail, password: hashedPassword },
    });

    const token = signToken(user.id);

    // ✅ remove password before returning
    const { password: _, ...safeUser } = user;

    return { user: safeUser, token };
  },

  async login(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);

    const users = await findUsersByEmail(normalizedEmail);
    let user: Awaited<ReturnType<typeof findUsersByEmail>>[number] | null = null;

    for (const candidate of users) {
      if (await bcrypt.compare(password, candidate.password)) {
        user = candidate;
        break;
      }
    }

    if (!user) throw new Error("Invalid credentials");

    const token = signToken(user.id);

    // ✅ remove password before returning
    const { password: _, ...safeUser } = user;

    return { user: safeUser, token };
  },
};
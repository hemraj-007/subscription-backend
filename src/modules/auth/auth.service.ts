import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

const SALT_ROUNDS = 10;
const normalizeEmail = (email: string) => email.trim().toLowerCase();

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

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

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

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      throw new Error("Invalid credentials");
    }

    const token = signToken(user.id);

    // ✅ remove password before returning
    const { password: _, ...safeUser } = user;

    return { user: safeUser, token };
  },
};
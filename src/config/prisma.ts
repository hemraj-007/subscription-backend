import { PrismaClient } from "@prisma/client";

// Reuse a single client across warm serverless invocations to avoid
// exhausting database connections (each cold start gets its own global).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;
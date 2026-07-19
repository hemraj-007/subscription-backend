import dotenv from "dotenv";
dotenv.config();

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

requireEnv("DATABASE_URL");
requireEnv("JWT_SECRET");

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 3001,
  DATABASE_URL: process.env.DATABASE_URL as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  RUN_SCHEDULER: parseBoolean(process.env.RUN_SCHEDULER, false),
  /** Comma-separated origins for CORS; if set, only these are allowed. Omit in dev for "*". */
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  /** Shared secret for the /api/jobs/run cron endpoint (Vercel Cron sends it as a Bearer token). */
  CRON_SECRET: process.env.CRON_SECRET,
  /** When true, POST /api/plan/upgrade activates Pro without a payment provider (dev/staging only). */
  BILLING_DEV_MODE: parseBoolean(process.env.BILLING_DEV_MODE, false),
};
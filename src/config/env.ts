import dotenv from "dotenv";
dotenv.config();

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
  PORT: process.env.PORT || 3001,
  DATABASE_URL: process.env.DATABASE_URL as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  /** Comma-separated origins for CORS; if set, only these are allowed. Omit in dev for "*". */
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
};
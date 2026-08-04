import rateLimit from "express-rate-limit";

/** Stricter limit for login/signup to reduce brute-force and enumeration. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many attempts; try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** General API limit to reduce abuse. */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: "Too many requests; try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  // Cron is authenticated via CRON_SECRET; never let shared traffic starve
  // renewal/unused alert generation (mounted under /api → path is /jobs/run).
  skip: (req) => {
    const path = req.path || "";
    return path === "/jobs/run" || path.endsWith("/jobs/run");
  },
});

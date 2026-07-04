import { Router, Request, Response } from "express";
import { env } from "../../config/env";
import { alertService } from "../alert/alert.service";

const router = Router();

/**
 * Scheduled job runner, invoked by Vercel Cron (see vercel.json `crons`).
 * Serverless has no long-running process, so cron jobs can't run in-process;
 * instead Vercel makes an HTTP request here on a schedule.
 *
 * Protected by CRON_SECRET: Vercel automatically sends it as
 * `Authorization: Bearer <CRON_SECRET>`. Fails closed if the secret is unset.
 */
router.get("/run", async (req: Request, res: Response) => {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return res
      .status(503)
      .json({ message: "Job runner not configured (missing CRON_SECRET)" });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    await alertService.runAlertJobsForAllUsers();
    res.json({ ok: true, ranAt: new Date().toISOString() });
  } catch (err) {
    console.error("[jobs] scheduled run failed:", err);
    res.status(500).json({ message: "Job run failed" });
  }
});

export default router;

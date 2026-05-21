import app from "./app";
import { env } from "./config/env";
import cron from "node-cron";
import { prisma } from "./config/prisma";

import { generateRenewalAlerts } from "./jobs/renewalAlert.job";
import { detectUnusedSubscriptions } from "./jobs/unusedSubscription.job";

async function runJobs() {
  console.log("Running background jobs at startup...");
  await generateRenewalAlerts();
  await detectUnusedSubscriptions();
}

function logJobError(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[jobs] ${context} failed: ${message}`);
}

async function start() {
  if (env.RUN_SCHEDULER) {
    try {
      await runJobs();
    } catch (error) {
      // Keep API startup resilient when DB/network is temporarily unavailable.
      logJobError("startup execution", error);
    }

    // Renewal alerts daily at midnight
    cron.schedule("0 0 * * *", async () => {
      console.log("Running renewal alert job");
      try {
        await generateRenewalAlerts();
      } catch (error) {
        logJobError("renewal alert cron run", error);
      }
    });

    // Unused subscription detection daily at 12:30am
    cron.schedule("30 0 * * *", async () => {
      console.log("Running unused subscription detection");
      try {
        await detectUnusedSubscriptions();
      } catch (error) {
        logJobError("unused subscription cron run", error);
      }
    });
  } else {
    console.log("Scheduler disabled (set RUN_SCHEDULER=true to enable jobs).");
  }

  const server = app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });

  let isShuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await prisma.$disconnect();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to disconnect Prisma cleanly: ${message}`);
      } finally {
        process.exit(0);
      }
    });
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

start();
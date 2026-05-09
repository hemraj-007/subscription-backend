import app from "./app";
import { env } from "./config/env";
import cron from "node-cron";

import { generateRenewalAlerts } from "./jobs/renewalAlert.job";
import { detectUnusedSubscriptions } from "./jobs/unusedSubscription.job";

async function runJob(name: string, job: () => Promise<void>) {
  try {
    await job();
  } catch (error) {
    console.error(`Background job failed: ${name}`, error);
  }
}

async function runJobs() {
  console.log("Running background jobs at startup...");
  await runJob("renewal alerts", generateRenewalAlerts);
  await runJob("unused subscription detection", detectUnusedSubscriptions);
}

function start() {
  // Renewal alerts daily at midnight
  cron.schedule("0 0 * * *", () => {
    console.log("Running renewal alert job");
    void runJob("renewal alerts", generateRenewalAlerts);
  });

  // Unused subscription detection daily at 12:30am
  cron.schedule("30 0 * * *", () => {
    console.log("Running unused subscription detection");
    void runJob("unused subscription detection", detectUnusedSubscriptions);
  });

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });

  void runJobs();
}

start();
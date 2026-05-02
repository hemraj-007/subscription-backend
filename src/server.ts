import app from "./app";
import { env } from "./config/env";
import cron from "node-cron";

import { generateRenewalAlerts } from "./jobs/renewalAlert.job";
import { detectUnusedSubscriptions } from "./jobs/unusedSubscription.job";

async function runJob(name: string, job: () => Promise<void>) {
  try {
    await job();
  } catch (error) {
    console.error(`${name} failed`, error);
  }
}

async function runJobs() {
  console.log("Running background jobs at startup...");
  await runJob("Renewal alert job", generateRenewalAlerts);
  await runJob("Unused subscription detection job", detectUnusedSubscriptions);
}

async function start() {
  await runJobs();

  // Renewal alerts daily at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("Running renewal alert job");
    await runJob("Renewal alert job", generateRenewalAlerts);
  });

  // Unused subscription detection daily at 12:30am
  cron.schedule("30 0 * * *", async () => {
    console.log("Running unused subscription detection");
    await runJob("Unused subscription detection job", detectUnusedSubscriptions);
  });

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
}

start();
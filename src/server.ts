import app from "./app";
import { env } from "./config/env";
import cron from "node-cron";

import { generateRenewalAlerts } from "./jobs/renewalAlert.job";
import { detectUnusedSubscriptions } from "./jobs/unusedSubscription.job";

async function runJob(name: string, job: () => Promise<void>) {
  try {
    console.log(`Running ${name}`);
    await job();
  } catch (error) {
    console.error(`${name} failed`, error);
  }
}

async function runJobs() {
  await runJob("renewal alert job", generateRenewalAlerts);
  await runJob("unused subscription detection", detectUnusedSubscriptions);
}

function scheduleJobs() {
  // Renewal alerts daily at midnight
  cron.schedule("0 0 * * *", () => {
    void runJob("renewal alert job", generateRenewalAlerts);
  });

  // Unused subscription detection daily at 12:30am
  cron.schedule("30 0 * * *", () => {
    void runJob("unused subscription detection", detectUnusedSubscriptions);
  });
}

function start() {
  scheduleJobs();
  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
    void runJobs();
  });
}

start();
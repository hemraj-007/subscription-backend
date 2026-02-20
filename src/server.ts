import app from "./app";
import { env } from "./config/env";
import cron from "node-cron";

import { generateRenewalAlerts } from "./jobs/renewalAlert.job";
import { detectUnusedSubscriptions } from "./jobs/unusedSubscription.job";

async function runJobs() {
  console.log("Running background jobs at startup...");
  await generateRenewalAlerts();
  await detectUnusedSubscriptions();
}

async function start() {
  await runJobs();

  // Renewal alerts daily at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("Running renewal alert job");
    await generateRenewalAlerts();
  });

  // Unused subscription detection daily at 12:30am
  cron.schedule("30 0 * * *", async () => {
    console.log("Running unused subscription detection");
    await detectUnusedSubscriptions();
  });

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
}

start();
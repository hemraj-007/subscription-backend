import { generateRenewalAlerts } from "../../jobs/renewalAlert.job";
import { detectUnusedSubscriptions } from "../../jobs/unusedSubscription.job";

/**
 * Alert generation is request-triggered (not a background scheduler) because the
 * backend runs on Vercel serverless, where in-process cron never fires. These
 * helpers are called after subscription detection (per user) and by the
 * /api/jobs/run endpoint that a Vercel Cron hits (all users).
 */
export const alertService = {
  /** Regenerate alerts for a single user (best-effort caller should catch errors). */
  async refreshAlertsForUser(userId: string) {
    await generateRenewalAlerts(userId);
    await detectUnusedSubscriptions(userId);
  },

  /** Run all alert jobs across every user (used by the scheduled cron endpoint). */
  async runAlertJobsForAllUsers() {
    await generateRenewalAlerts();
    await detectUnusedSubscriptions();
  },
};

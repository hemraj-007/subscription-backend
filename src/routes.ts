import { Router } from "express";
import authRoutes from "./modules/auth/auth.routes";
import cardRoutes from "./modules/card/card.routes";
import transactionRoutes from "./modules/transaction/transaction.routes";
import subscriptionRoutes from "./modules/subscription/subscription.routes";
import alertRoutes from "./modules/alert/alert.routes";
import jobRoutes from "./modules/jobs/jobs.routes";
import planRoutes from "./modules/plan/plan.routes";
import insightsRoutes from "./modules/insights/insights.routes";
import { apiRateLimiter } from "./middlewares/rateLimit.middleware";

const router = Router();
router.use(apiRateLimiter);

router.use("/auth", authRoutes);
router.use("/cards", cardRoutes);
router.use("/transactions", transactionRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/alerts", alertRoutes);
router.use("/jobs", jobRoutes);
router.use("/plan", planRoutes);
router.use("/insights", insightsRoutes);

export default router;
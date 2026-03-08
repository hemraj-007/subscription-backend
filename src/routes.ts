import { Router } from "express";
import authRoutes from "./modules/auth/auth.routes";
import cardRoutes from "./modules/card/card.routes";
import transactionRoutes from "./modules/transaction/transaction.routes";
import subscriptionRoutes from "./modules/subscription/subscription.routes";
import alertRoutes from "./modules/alert/alert.routes";
import { apiRateLimiter } from "./middlewares/rateLimit.middleware";

const router = Router();
router.use(apiRateLimiter);

router.use("/auth", authRoutes);
router.use("/cards", cardRoutes);
router.use("/transactions", transactionRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/alerts", alertRoutes);

export default router;
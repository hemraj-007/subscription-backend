import { Router } from "express";
import authRoutes from "./modules/auth/auth.routes";
import cardRoutes from "./modules/card/card.routes";
import transactionRoutes from "./modules/transaction/transaction.routes";
import subscriptionRoutes from "./modules/subscription/subscription.routes";



const router = Router();

router.use("/auth", authRoutes);
router.use("/cards", cardRoutes);
router.use("/transactions", transactionRoutes);
router.use("/subscriptions", subscriptionRoutes);

export default router;
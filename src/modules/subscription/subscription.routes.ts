import { Router } from "express";
import { subscriptionController } from "./subscription.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.post("/detect", authMiddleware, subscriptionController.detect);
router.get("/", authMiddleware, subscriptionController.list);

export default router;
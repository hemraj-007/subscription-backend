import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requirePro } from "../../middlewares/plan.middleware";
import { insightsController } from "./insights.controller";

const router = Router();

router.use(authMiddleware);
router.use(requirePro);

router.get("/", insightsController.list);

export default router;

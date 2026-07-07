import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { planController } from "./plan.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", planController.status);
router.post("/upgrade", planController.upgrade);

export default router;

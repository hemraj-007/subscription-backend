import { Router } from "express";
import { authController } from "./auth.controller";
import { authRateLimiter } from "../../middlewares/rateLimit.middleware";

const router = Router();

router.post("/signup", authRateLimiter, authController.signup);
router.post("/login", authRateLimiter, authController.login);

export default router;
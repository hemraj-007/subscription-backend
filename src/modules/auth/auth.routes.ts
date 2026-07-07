import { Router } from "express";
import { authController } from "./auth.controller";
import { authRateLimiter } from "../../middlewares/rateLimit.middleware";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.post("/signup", authRateLimiter, authController.signup);
router.post("/login", authRateLimiter, authController.login);
router.get("/me", authMiddleware, authController.me);

export default router;
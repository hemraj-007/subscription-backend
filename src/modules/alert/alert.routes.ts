import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { AuthRequest } from "../../middlewares/auth.middleware";
import { prisma } from "../../config/prisma";

const router = Router();

router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  const alerts = await prisma.alert.findMany({
    where: { userId: req.userId },
    orderBy: { scheduledAt: "asc" },
  });

  res.json(alerts);
});

export default router;
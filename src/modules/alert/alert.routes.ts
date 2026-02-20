import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { prisma } from "../../config/prisma";

const router = Router();

router.get("/", authMiddleware, async (req, res) => {
  const alerts = await prisma.alert.findMany({
    where: { userId: req.userId },
    orderBy: { scheduledAt: "asc" },
  });

  res.json(alerts);
});

export default router;
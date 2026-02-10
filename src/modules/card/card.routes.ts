import { Router } from "express";
import { cardController } from "./card.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.post("/", authMiddleware, cardController.create);
router.get("/", authMiddleware, cardController.list);
router.delete("/:id", authMiddleware, cardController.remove);

export default router;
import { Router } from "express";
import multer from "multer";
import { transactionController } from "./transaction.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const upload = multer({ dest: "uploads/" });
const router = Router();

router.post(
  "/upload",
  authMiddleware,
  upload.any(),
  transactionController.upload
);

router.get("/", authMiddleware, transactionController.list);

export default router;
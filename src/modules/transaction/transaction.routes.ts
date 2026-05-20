import path from "path";
import os from "os";
import { Router } from "express";
import multer from "multer";
import { transactionController } from "./transaction.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const uploadDir = path.join(os.tmpdir(), "subscription-guardian-uploads");
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});
const router = Router();

router.post(
  "/upload",
  authMiddleware,
  upload.single("file"),
  transactionController.upload
);

router.get("/", authMiddleware, transactionController.list);

export default router;
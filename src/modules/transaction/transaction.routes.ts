import path from "path";
import os from "os";
import fs from "fs";
import { Router } from "express";
import multer from "multer";
import { transactionController } from "./transaction.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const uploadDir = path.join(os.tmpdir(), "subscription-guardian-uploads");
try {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
} catch {
  // Dir may already exist; multer will use it
}

const MAX_STATEMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_STATEMENT_MIMETYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/octet-stream",
  "application/pdf",
];

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: MAX_STATEMENT_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const okType = ALLOWED_STATEMENT_MIMETYPES.includes(file.mimetype);
    const okExt = ext === ".csv" || ext === ".pdf";
    if (okExt || okType) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV or PDF statement files are allowed"));
    }
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
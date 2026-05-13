import path from "path";
import os from "os";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { transactionController } from "./transaction.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const uploadDir = path.join(os.tmpdir(), "subscription-guardian-uploads");
const MAX_CSV_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: MAX_CSV_UPLOAD_SIZE_BYTES,
    files: 1,
  },
});
const uploadCsv = upload.any();
const router = Router();

function handleUpload(req: Request, res: Response, next: NextFunction) {
  uploadCsv(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      const isTooLarge = err.code === "LIMIT_FILE_SIZE";
      res.status(isTooLarge ? 413 : 400).json({
        message: isTooLarge ? "Uploaded CSV is too large" : err.message,
      });
      return;
    }

    next(err);
  });
}

router.post(
  "/upload",
  authMiddleware,
  handleUpload,
  transactionController.upload
);

router.get("/", authMiddleware, transactionController.list);

export default router;
import path from "path";
import os from "os";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { transactionController } from "./transaction.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const uploadDir = path.join(os.tmpdir(), "subscription-guardian-uploads");
const MAX_CSV_UPLOAD_BYTES = 10 * 1024 * 1024;
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: MAX_CSV_UPLOAD_BYTES,
    files: 1,
    fields: 10,
    parts: 11,
  },
});
const router = Router();

function uploadCsv(req: Request, res: Response, next: NextFunction) {
  upload.any()(req, res, (err: unknown) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      const isTooLarge = err.code === "LIMIT_FILE_SIZE";
      return res.status(isTooLarge ? 413 : 400).json({
        message: isTooLarge
          ? "CSV file is too large"
          : "Invalid upload; send one CSV file and cardId",
      });
    }

    return next(err);
  });
}

router.post(
  "/upload",
  authMiddleware,
  uploadCsv,
  transactionController.upload
);

router.get("/", authMiddleware, transactionController.list);

export default router;
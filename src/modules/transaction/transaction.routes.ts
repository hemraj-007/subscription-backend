import path from "path";
import os from "os";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { transactionController } from "./transaction.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const uploadDir = path.join(os.tmpdir(), "subscription-guardian-uploads");
const MAX_TRANSACTION_UPLOAD_BYTES = 5 * 1024 * 1024;
const upload = multer({
  dest: uploadDir,
  limits: {
    files: 1,
    fileSize: MAX_TRANSACTION_UPLOAD_BYTES,
  },
});
const router = Router();

function transactionCsvUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const isTooLarge = err.code === "LIMIT_FILE_SIZE";
      return res.status(isTooLarge ? 413 : 400).json({
        message: isTooLarge ? "File too large" : "Invalid file upload",
      });
    }

    if (err) {
      return next(err);
    }

    next();
  });
}

router.post(
  "/upload",
  authMiddleware,
  transactionCsvUpload,
  transactionController.upload
);

router.get("/", authMiddleware, transactionController.list);

export default router;
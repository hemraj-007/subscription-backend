import fs from "fs/promises";
import { Response } from "express";
import { transactionService } from "./transaction.service";
import { parseCSV } from "./transaction.parser";
import { cardService } from "../card/card.service";
import { AuthRequest } from "../../middlewares/auth.middleware";

async function deleteUploadedFile(path: string) {
  try {
    await fs.unlink(path);
  } catch {
    // Ignore cleanup errors; avoid leaking paths in response
  }
}

export const transactionController = {
  async upload(req: AuthRequest, res: Response) {
    const body = req.body ?? {};
    const rawCardId = body.cardId ?? req.query.cardId;
    const cardId =
      typeof rawCardId === "string"
        ? rawCardId.trim()
        : Array.isArray(rawCardId) && rawCardId[0]
          ? String(rawCardId[0]).trim()
          : "";
    const files: Express.Multer.File[] = Array.isArray(req.files)
      ? req.files
      : req.files
        ? Object.values(req.files).flat()
        : [];
    const file = files.find((f) => f.fieldname === "file") ?? files[0];

    if (!file && !cardId) {
      return res.status(400).json({ message: "Missing file and cardId" });
    }
    if (!file) {
      return res.status(400).json({ message: "Missing file" });
    }
    if (!cardId) {
      return res.status(400).json({ message: "Missing cardId" });
    }

    const card = await cardService.getCardForUser(req.userId!, cardId);
    if (!card) {
      await deleteUploadedFile(file.path);
      return res.status(404).json({ message: "Card not found" });
    }

    try {
      const parsed = await parseCSV(file.path);
      await transactionService.saveTransactions(cardId, parsed);
      res.json({ imported: parsed.length });
    } finally {
      await deleteUploadedFile(file.path);
    }
  },

  async list(req: AuthRequest, res: Response) {
    const tx = await transactionService.getTransactions(req.userId!);
    res.json(tx);
  },
};
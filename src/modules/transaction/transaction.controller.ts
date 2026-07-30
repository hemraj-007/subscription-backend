import fs from "fs/promises";
import { Response } from "express";
import { transactionService } from "./transaction.service";
import { parseStatement } from "./transaction.parser";
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
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: cardId ? "Missing file" : "Missing file and cardId",
      });
    }

    // Multer has already written `file` to disk. Every exit path below must
    // unlink it — including validation failures — or /tmp fills and later
    // statement uploads fail for everyone on the instance.
    try {
      if (!cardId) {
        return res.status(400).json({ message: "Missing cardId" });
      }

      const card = await cardService.getCardForUser(req.userId!, cardId);
      if (!card) {
        return res.status(404).json({ message: "Card not found" });
      }

      try {
        const parsed = await parseStatement(
          file.path,
          file.originalname,
          file.mimetype
        );
        const result = await transactionService.saveTransactions(cardId, parsed);
        res.json({
          imported: result.inserted,
          duplicatesSkipped: result.skipped,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to parse statement";
        return res.status(400).json({ message });
      }
    } finally {
      await deleteUploadedFile(file.path);
    }
  },

  async list(req: AuthRequest, res: Response) {
    const tx = await transactionService.getTransactions(req.userId!);
    res.json(tx);
  },
};

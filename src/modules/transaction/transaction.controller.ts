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

async function deleteUploadedFiles(files: Express.Multer.File[]) {
  await Promise.all(files.map((file) => deleteUploadedFile(file.path)));
}

function getUploadedFiles(req: AuthRequest): Express.Multer.File[] {
  const files: Express.Multer.File[] = [];

  if (req.file) {
    files.push(req.file);
  }

  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files) {
    files.push(...Object.values(req.files).flat());
  }

  return files;
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
    const files = getUploadedFiles(req);
    const file = files.find((f) => f.fieldname === "file") ?? files[0];

    if (!file && !cardId) {
      return res.status(400).json({ message: "Missing file and cardId" });
    }
    if (!file) {
      return res.status(400).json({ message: "Missing file" });
    }
    if (!cardId) {
      await deleteUploadedFiles(files);
      return res.status(400).json({ message: "Missing cardId" });
    }

    const card = await cardService.getCardForUser(req.userId!, cardId);
    if (!card) {
      await deleteUploadedFiles(files);
      return res.status(404).json({ message: "Card not found" });
    }

    try {
      const parsed = await parseCSV(file.path);
      await transactionService.saveTransactions(cardId, parsed);
      res.json({ imported: parsed.length });
    } finally {
      await deleteUploadedFiles(files);
    }
  },

  async list(req: AuthRequest, res: Response) {
    const tx = await transactionService.getTransactions(req.userId!);
    res.json(tx);
  },
};
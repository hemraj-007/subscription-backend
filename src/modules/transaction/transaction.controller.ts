import { Response } from "express";
import { transactionService } from "./transaction.service";
import { parseCSV } from "./transaction.parser";
import { AuthRequest } from "../../middlewares/auth.middleware";

export const transactionController = {
  async upload(req: AuthRequest, res: Response) {
    const { cardId } = req.body;

    if (!req.file || !cardId) {
      return res.status(400).json({ message: "Missing file or cardId" });
    }

    const parsed = await parseCSV(req.file.path);

    await transactionService.saveTransactions(cardId, parsed);

    res.json({ imported: parsed.length });
  },

  async list(req: AuthRequest, res: Response) {
    const tx = await transactionService.getTransactions(req.userId!);
    res.json(tx);
  },
};
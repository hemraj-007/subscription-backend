import { Response } from "express";
import { cardService } from "./card.service";
import { AuthRequest } from "../../middlewares/auth.middleware";

export const cardController = {
  async create(req: AuthRequest, res: Response) {
    const { last4, bankName, network } = req.body;

    const trimmed = typeof last4 === "string" ? last4.trim() : "";
    if (!/^\d{4}$/.test(trimmed)) {
      return res.status(400).json({ message: "Invalid card digits; provide exactly 4 digits" });
    }

    const card = await cardService.createCard(req.userId!, {
      last4: trimmed,
      bankName: typeof bankName === "string" ? bankName.trim().slice(0, 100) : undefined,
      network: typeof network === "string" ? network.trim().slice(0, 50) : undefined,
    });

    res.status(201).json(card);
  },

  async list(req: AuthRequest, res: Response) {
    try {
      const cards = await cardService.getCards(req.userId!);
      res.json(cards);
    } catch (err) {
      console.error("[cards] list error:", err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      const isDb =
        code === "P1001" || code === "P1002" || code === "P1008";
      res.status(isDb ? 503 : 500).json({
        message: isDb
          ? "Database is unavailable. Check that PostgreSQL is running and DATABASE_URL is correct."
          : "Internal server error",
      });
    }
  },

  async remove(req: AuthRequest, res: Response) {
    const raw = req.params.id;
    const id = Array.isArray(raw) ? raw[0] ?? "" : (raw ?? "");

    try {
      const result = await cardService.deleteCard(req.userId!, id);
      if (result.count === 0) {
        return res
          .status(404)
          .json({ message: "Card not found or you don't have access to it" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[cards] delete error:", err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      const isDb = code === "P1001" || code === "P1002" || code === "P1008";
      res.status(isDb ? 503 : 500).json({
        message: isDb
          ? "Database is unavailable. Check that PostgreSQL is running and DATABASE_URL is correct."
          : "Failed to delete card",
      });
    }
  },
};
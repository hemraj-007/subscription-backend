import { Response } from "express";
import { cardService } from "./card.service";
import { AuthRequest } from "../../middlewares/auth.middleware";

export const cardController = {
  async create(req: AuthRequest, res: Response) {
    const { last4, bankName, network } = req.body;

    if (!last4 || last4.length !== 4) {
      return res.status(400).json({ message: "Invalid card digits" });
    }

    const card = await cardService.createCard(req.userId!, {
      last4,
      bankName,
      network,
    });

    res.status(201).json(card);
  },

  async list(req: AuthRequest, res: Response) {
    const cards = await cardService.getCards(req.userId!);
    res.json(cards);
  },

  async remove(req: AuthRequest, res: Response) {
    const { id } = req.params;

    await cardService.deleteCard(req.userId!, id);
    res.json({ success: true });
  },
};
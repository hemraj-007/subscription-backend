import { Response } from "express";
import { AuthRequest } from "../../middlewares/auth.middleware";
import { subscriptionService } from "./subscription.service";

export const subscriptionController = {
  async detect(req: AuthRequest, res: Response) {
    const subs = await subscriptionService.detectAndSave(req.userId!);
    res.json(subs);
  },

  async list(req: AuthRequest, res: Response) {
    const subs = await subscriptionService.list(req.userId!);
    res.json(subs);
  },
};
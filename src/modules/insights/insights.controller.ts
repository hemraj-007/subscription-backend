import { Response } from "express";
import { AuthRequest } from "../../middlewares/auth.middleware";
import { insightsService } from "./insights.service";

export const insightsController = {
  async list(req: AuthRequest, res: Response) {
    try {
      const insights = await insightsService.generateInsights(req.userId!);
      res.json({ insights, generatedAt: new Date().toISOString() });
    } catch (err) {
      console.error("[insights] list error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  },
};

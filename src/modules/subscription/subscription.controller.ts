import { Response } from "express";
import { AuthRequest } from "../../middlewares/auth.middleware";
import { subscriptionService } from "./subscription.service";
import {
  parseCardIdsFromQuery,
  resolveCardIdsForUser,
} from "./subscription.query";

function prismaErrorStatus(err: unknown): number {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: string }).code);
    if (code === "P1001" || code === "P1002" || code === "P1008") return 503;
  }
  return 500;
}

function prismaErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: string }).code);
    if (code === "P1001" || code === "P1002" || code === "P1008") {
      return "Database is unavailable. Check that PostgreSQL is running and DATABASE_URL is correct.";
    }
  }
  return "Internal server error";
}

export const subscriptionController = {
  async detect(req: AuthRequest, res: Response) {
    try {
      const subs = await subscriptionService.detectAndSave(req.userId!);
      res.json(subs);
    } catch (err) {
      console.error("[subscriptions] detect error:", err);
      const status = prismaErrorStatus(err);
      res.status(status).json({ message: prismaErrorMessage(err) });
    }
  },

  async list(req: AuthRequest, res: Response) {
    try {
      const requested = parseCardIdsFromQuery(req);
      const cardIds = await resolveCardIdsForUser(req.userId!, requested);
      const subs = await subscriptionService.list(req.userId!, cardIds);
      res.json(subs);
    } catch (err) {
      console.error("[subscriptions] list error:", err);
      const status = prismaErrorStatus(err);
      res.status(status).json({ message: prismaErrorMessage(err) });
    }
  },

  async summary(req: AuthRequest, res: Response) {
    try {
      const requested = parseCardIdsFromQuery(req);
      const cardIds = await resolveCardIdsForUser(req.userId!, requested);
      const summary = await subscriptionService.getSummary(req.userId!, cardIds);
      res.json(summary);
    } catch (err) {
      console.error("[subscriptions] summary error:", err);
      const status = prismaErrorStatus(err);
      res.status(status).json({ message: prismaErrorMessage(err) });
    }
  },
};
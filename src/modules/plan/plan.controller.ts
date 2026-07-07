import { Response } from "express";
import { AuthRequest } from "../../middlewares/auth.middleware";
import { planService } from "./plan.service";

export const planController = {
  async status(req: AuthRequest, res: Response) {
    try {
      const status = await planService.getPlanStatus(req.userId!);
      res.json(status);
    } catch (err) {
      console.error("[plan] status error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  },

  async upgrade(req: AuthRequest, res: Response) {
    try {
      const status = await planService.upgradeToPro(req.userId!);
      res.json(status);
    } catch (err: unknown) {
      const status =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status?: number }).status) || 500
          : 500;
      const message =
        err instanceof Error ? err.message : "Upgrade failed";
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : undefined;
      res.status(status).json({ message, ...(code && { code }) });
    }
  },
};

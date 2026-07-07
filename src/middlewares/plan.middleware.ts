import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";
import { planService } from "../modules/plan/plan.service";
import { PlanLimitError } from "../modules/plan/plan.errors";

export const requirePro = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    await planService.assertPro(req.userId!);
    next();
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return res.status(err.status).json({
        message: err.message,
        code: err.code,
        feature: err.feature,
        requiredPlan: err.requiredPlan,
      });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

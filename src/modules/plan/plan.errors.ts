export class PlanLimitError extends Error {
  readonly code = "PLAN_LIMIT";
  readonly status = 403;
  readonly feature: string;
  readonly requiredPlan: "PRO";

  constructor(message: string, feature: string) {
    super(message);
    this.name = "PlanLimitError";
    this.feature = feature;
    this.requiredPlan = "PRO";
  }
}

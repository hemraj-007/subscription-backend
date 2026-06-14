import { normalizeMerchant } from "../modules/subscription/merchant.normalizer";

export function buildSubscriptionActivityKey(
  cardId: string,
  merchant: string,
  amount: number
): string {
  return `${cardId}:${normalizeMerchant(merchant)}:${amount}`;
}

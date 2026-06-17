import { normalizeMerchant } from "../modules/subscription/merchant.normalizer";

type TransactionMerchantMax = {
  cardId: string;
  merchant: string;
  _max: { date: Date | null };
};

export function subscriptionActivityKey(cardId: string, merchant: string): string {
  return `${cardId}:${normalizeMerchant(merchant)}`;
}

export function lastTransactionDatesByNormalizedMerchant(
  txGroups: TransactionMerchantMax[]
): Map<string, Date> {
  const lastTxByCardMerchant = new Map<string, Date>();

  for (const row of txGroups) {
    if (!row._max.date) continue;

    const key = subscriptionActivityKey(row.cardId, row.merchant);
    const existing = lastTxByCardMerchant.get(key);
    if (!existing || row._max.date > existing) {
      lastTxByCardMerchant.set(key, row._max.date);
    }
  }

  return lastTxByCardMerchant;
}

import { normalizeMerchant } from "../modules/subscription/merchant.normalizer";

export type TransactionMerchantGroup = {
  cardId: string;
  merchant: string;
  _max: {
    date: Date | null;
  };
};

export function normalizedCardMerchantKey(cardId: string, merchant: string): string {
  return `${cardId}:${normalizeMerchant(merchant)}`;
}

export function buildLastTxByNormalizedCardMerchant(
  txGroups: TransactionMerchantGroup[]
): Map<string, Date> {
  const lastTxByCardMerchant = new Map<string, Date>();

  for (const row of txGroups) {
    if (!row._max.date) continue;

    const key = normalizedCardMerchantKey(row.cardId, row.merchant);
    const existing = lastTxByCardMerchant.get(key);
    if (!existing || row._max.date > existing) {
      lastTxByCardMerchant.set(key, row._max.date);
    }
  }

  return lastTxByCardMerchant;
}

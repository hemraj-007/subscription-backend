import { Request } from "express";
import { cardService } from "../card/card.service";

export function parseCardIdsFromQuery(req: Request): string[] | undefined {
  const raw = req.query.cardIds ?? req.query.cardId;
  if (raw === undefined || raw === null || raw === "") return undefined;

  const parts = Array.isArray(raw)
    ? raw.flatMap((v) => String(v).split(","))
    : String(raw).split(",");

  const ids = parts.map((id) => id.trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

export async function resolveCardIdsForUser(
  userId: string,
  requested?: string[]
): Promise<string[] | undefined> {
  if (!requested?.length) return undefined;
  const owned = await cardService.filterOwnedCardIds(userId, requested);
  return owned;
}

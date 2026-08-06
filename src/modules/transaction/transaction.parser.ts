import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { extractPdfContent } from "./pdf.extractor";
import { parseTransactionsFromPdfContent } from "./statement-text.parser";
import { ParsedTransaction, TransactionKind } from "./transaction.types";

export type { ParsedTransaction } from "./transaction.types";

// Common column names on real bank/credit card statement exports (case-insensitive)
const MERCHANT_COLUMN_ALIASES = [
  "merchant",
  "description",
  "transaction description",
  "details",
  "particulars",
  "narration",
  "merchant name",
  "name",
  "payee",
  "transaction details",
];

const AMOUNT_COLUMN_ALIASES = [
  "amount",
  "transaction amount",
  "transaction amount (inr)",
  "txn amount",
];

const DEBIT_COLUMN_ALIASES = [
  "debit",
  "debit amount",
  "withdrawal",
  "withdrawal amount",
];

const CREDIT_COLUMN_ALIASES = [
  "credit",
  "credit amount",
  "deposit",
  "deposit amount",
];

const DATE_COLUMN_ALIASES = [
  "date",
  "transaction date",
  "posting date",
  "value date",
  "trans date",
  "transaction date (posting)",
  "booking date",
];

/** Direction markers in a dedicated column (common on Indian bank CSV exports). */
const TYPE_COLUMN_ALIASES = [
  "dr cr",
  "cr dr",
  "type",
  "txn type",
  "transaction type",
  "transaction indicator",
  "debit credit",
  "credit debit",
];

function findColumnKey(
  headerKeys: string[],
  aliases: string[]
): string | undefined {
  const normalized = new Map(
    headerKeys.map((k) => [k.toLowerCase().trim(), k])
  );
  for (const alias of aliases) {
    if (normalized.has(alias)) return normalized.get(alias);
  }
  return undefined;
}

/** Collapse punctuation so "Dr/Cr" and "Dr / Cr" both match alias "dr cr". */
function findTypeColumnKey(headerKeys: string[]): string | undefined {
  const normalized = new Map(
    headerKeys.map((k) => [
      k.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
      k,
    ])
  );
  for (const alias of TYPE_COLUMN_ALIASES) {
    if (normalized.has(alias)) return normalized.get(alias);
  }
  return undefined;
}

/**
 * Map a Type / Dr-Cr cell to DEBIT or CREDIT. Returns null when the cell is
 * empty or not a direction marker (so callers can fall back to other heuristics).
 */
function inferTypeFromDirectionCell(raw: unknown): TransactionKind | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/^(cr|c|credit|deposit|crt|\+|money in)$/i.test(s)) return "CREDIT";
  if (/^(dr|d|debit|withdrawal|wdr|\-|money out)$/i.test(s)) return "DEBIT";
  // Allow "CR." / "DR." and short tokens with trailing punctuation.
  if (/^cr\.?$/.test(s)) return "CREDIT";
  if (/^dr\.?$/.test(s)) return "DEBIT";
  return null;
}

/** Reject parsed values above this (10 crore) — almost certainly a ref/account number. */
const MAX_REASONABLE_AMOUNT = 100_000_000;

function parseAmount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  let s = String(raw).trim().replace(/,/g, "");
  const negative = s.startsWith("(") && s.endsWith(")");
  if (negative) s = s.slice(1, -1);
  s = s.replace(/[₹]|Rs\.?|INR/gi, "").trim();
  // Strip leading/trailing Cr/Dr markers before numeric cleanup. Otherwise
  // "Cr. 48000" becomes ".48000" (the dot from "Cr.") and Number() yields NaN.
  s = s.replace(/^(cr|dr)\.?\s*/i, "").replace(/\s*(cr|dr)\.?$/i, "").trim();
  const n = Number(s.replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return 0;
  const abs = Math.abs(n);
  if (abs > MAX_REASONABLE_AMOUNT) return 0;
  return abs;
}

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function utcDate(year: number, month1to12: number, day: number): Date {
  if (month1to12 < 1 || month1to12 > 12 || day < 1 || day > 31) {
    return new Date(NaN);
  }
  // Build in UTC so the stored .toISOString() day matches the statement day.
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

function fullYear(raw: string): number {
  return raw.length === 2 ? 2000 + Number(raw) : Number(raw);
}

/**
 * Parses statement dates without timezone drift. Bank/CSV exports are almost
 * always day-first (DD/MM/YYYY, DD-MM-YYYY, DD-Mon-YYYY); `new Date("02-05-2026")`
 * would wrongly read that as month-first (May -> Feb). We disambiguate explicitly.
 */
function parseDate(raw: unknown): Date {
  if (raw === undefined || raw === null || raw === "") return new Date(NaN);
  const s = String(raw).trim();
  if (!s) return new Date(NaN);

  // ISO: YYYY-MM-DD (optionally with a time component).
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Numeric DD/MM/YYYY or MM/DD/YYYY (separators / - .). Default day-first.
  const numeric = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const year = fullYear(numeric[3]);
    let day = a;
    let month = b;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      day = b;
      month = a;
    }
    return utcDate(year, month, day);
  }

  // DD-Mon-YYYY / "DD Mon YYYY" (e.g. 02-May-2026, 2 May 26).
  const dMon = s.match(/^(\d{1,2})[\s\-]+([A-Za-z]{3,9})[\s\-,]+(\d{2,4})$/);
  if (dMon) {
    const month = MONTH_NAMES.indexOf(dMon[2].slice(0, 3).toLowerCase()) + 1;
    if (month >= 1) return utcDate(fullYear(dMon[3]), month, Number(dMon[1]));
  }

  // "Mon DD, YYYY" (e.g. May 2, 2026).
  const monD = s.match(/^([A-Za-z]{3,9})[\s\-]+(\d{1,2})[\s\-,]+(\d{2,4})$/);
  if (monD) {
    const month = MONTH_NAMES.indexOf(monD[1].slice(0, 3).toLowerCase()) + 1;
    if (month >= 1) return utcDate(fullYear(monD[3]), month, Number(monD[2]));
  }

  // Last resort: let JS parse, then pin to UTC midnight to avoid tz drift.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return d;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export const parseCSV = (filePath: string): Promise<ParsedTransaction[]> => {
  return new Promise((resolve, reject) => {
    const results: ParsedTransaction[] = [];
    let resolved = false;
    let merchantKey = "merchant";
    let amountKey: string | undefined;
    let debitKey: string | undefined;
    let creditKey: string | undefined;
    let typeKey: string | undefined;
    let dateKey = "date";

    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, relax_column_count: true }))
      .on("data", (row: Record<string, unknown>) => {
        // Resolve column mapping from header names (first row)
        if (!resolved) {
          const headers = Object.keys(row);
          merchantKey =
            findColumnKey(headers, MERCHANT_COLUMN_ALIASES) ?? headers[0] ?? "merchant";
          debitKey = findColumnKey(headers, DEBIT_COLUMN_ALIASES);
          creditKey = findColumnKey(headers, CREDIT_COLUMN_ALIASES);
          typeKey = findTypeColumnKey(headers);
          amountKey =
            findColumnKey(headers, AMOUNT_COLUMN_ALIASES) ??
            // Only fall back to a generic "amount"-ish header when there is no
            // dedicated debit/credit column (avoids picking up "balance").
            (debitKey || creditKey
              ? undefined
              : headers.find((h) => /amount/i.test(h)));
          dateKey =
            findColumnKey(headers, DATE_COLUMN_ALIASES) ??
            headers.find((h) => /date/i.test(h)) ??
            "date";
          resolved = true;
        }

        const rawMerchant = row[merchantKey] ?? row.merchant ?? row.description ?? "";
        const merchant = String(rawMerchant ?? "").trim() || "Unknown";

        // Prefer dedicated debit/credit columns; fall back to a generic amount column.
        const debit = debitKey ? parseAmount(row[debitKey]) : 0;
        const credit = creditKey ? parseAmount(row[creditKey]) : 0;
        const rawGeneric = amountKey ? String(row[amountKey] ?? row.amount ?? "") : "";
        const generic = parseAmount(rawGeneric);
        const directionFromTypeCol = typeKey
          ? inferTypeFromDirectionCell(row[typeKey])
          : null;

        let amount = generic;
        let type: TransactionKind = "DEBIT";
        if (debit > 0) {
          amount = debit;
          type = "DEBIT";
        } else if (credit > 0) {
          amount = credit;
          type = "CREDIT";
        } else if (generic > 0) {
          // Prefer an explicit Type / Dr-Cr column when present. Otherwise:
          // trailing CR/DR markers, then signed-amount heuristics ("+" = money in).
          if (directionFromTypeCol) {
            type = directionFromTypeCol;
          } else if (/\bCR\b/i.test(rawGeneric) || /^\s*cr\.?\b/i.test(rawGeneric)) {
            type = "CREDIT";
          } else if (/\bDR\b/i.test(rawGeneric) || /^\s*dr\.?\b/i.test(rawGeneric)) {
            type = "DEBIT";
          } else {
            type = /^\s*\+/.test(rawGeneric) ? "CREDIT" : "DEBIT";
          }
        }

        const date = parseDate(row[dateKey] ?? row.date);

        if (!merchant || amount <= 0 || Number.isNaN(date.getTime())) return;

        results.push({
          merchant,
          amount,
          type,
          date,
        });
      })
      .on("end", () => resolve(results))
      .on("error", reject);
  });
};

async function parsePDF(filePath: string): Promise<ParsedTransaction[]> {
  const { text, rows } = await extractPdfContent(filePath);
  const transactions = parseTransactionsFromPdfContent(text, rows);

  if (transactions.length === 0) {
    throw new Error(
      "No transactions found in PDF. The file may use an unsupported layout — try exporting CSV from your bank."
    );
  }

  return transactions;
}

export async function parseStatement(
  filePath: string,
  originalName: string,
  mimeType: string
): Promise<ParsedTransaction[]> {
  const ext = path.extname(originalName || "").toLowerCase();
  const isPdfMime = mimeType === "application/pdf";

  if (ext === ".csv") return parseCSV(filePath);
  if (ext === ".pdf" || isPdfMime) return parsePDF(filePath);

  throw new Error("Unsupported statement format. Please upload CSV or PDF.");
}

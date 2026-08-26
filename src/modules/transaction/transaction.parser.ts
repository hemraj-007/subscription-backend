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

/** Field separators used by bank/Excel CSV exports (EU locales use `;`, some TSV). */
const CSV_FIELD_DELIMITERS = [",", ";", "\t"] as const;

function countUnquoted(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === delimiter) count++;
  }
  return count;
}

/**
 * Pick a single delimiter from the header line. Enabling `,` and `;` at once
 * would split unquoted Indian narrations that contain `;` (UPI;NETFLIX).
 */
function detectCsvDelimiter(headerLine: string): string {
  const line = headerLine.replace(/^\uFEFF/, "");
  let best: string = ",";
  let bestCount = 0;
  for (const delimiter of CSV_FIELD_DELIMITERS) {
    const count = countUnquoted(line, delimiter);
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

function peekFirstNonEmptyLine(filePath: string): string {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(16384);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const text = buf.subarray(0, n).toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim().length > 0) return line;
    }
    return "";
  } finally {
    fs.closeSync(fd);
  }
}

/** Reject parsed values above this (10 crore) — almost certainly a ref/account number. */
const MAX_REASONABLE_AMOUNT = 100_000_000;

function parseAmount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const s = String(raw).trim().replace(/,/g, "");
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
    let dateKey = "date";
    const delimiter = detectCsvDelimiter(peekFirstNonEmptyLine(filePath));

    fs.createReadStream(filePath)
      .pipe(
        parse({
          columns: true,
          trim: true,
          relax_column_count: true,
          skip_empty_lines: true,
          bom: true,
          delimiter,
        })
      )
      .on("data", (row: Record<string, unknown>) => {
        // Resolve column mapping from header names (first row)
        if (!resolved) {
          const headers = Object.keys(row);
          merchantKey =
            findColumnKey(headers, MERCHANT_COLUMN_ALIASES) ?? headers[0] ?? "merchant";
          debitKey = findColumnKey(headers, DEBIT_COLUMN_ALIASES);
          creditKey = findColumnKey(headers, CREDIT_COLUMN_ALIASES);
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

        let amount = generic;
        let type: TransactionKind = "DEBIT";
        if (debit > 0) {
          amount = debit;
          type = "DEBIT";
        } else if (credit > 0) {
          amount = credit;
          type = "CREDIT";
        } else if (generic > 0) {
          // A leading "-" or parenthesis in a single amount column means money in.
          type = /^\s*[-(]/.test(rawGeneric) ? "CREDIT" : "DEBIT";
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

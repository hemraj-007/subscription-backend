import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { extractPdfContent } from "./pdf.extractor";
import { parseTransactionsFromPdfContent } from "./statement-text.parser";
import { ParsedTransaction } from "./transaction.types";

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
  "debit",
  "credit",
  "transaction amount",
  "debit amount",
  "credit amount",
  "transaction amount (inr)",
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

function parseAmount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const s = String(raw).trim().replace(/,/g, "");
  const n = Number(s);
  if (Number.isNaN(n)) return 0;
  return Math.abs(n);
}

function parseDate(raw: unknown): Date {
  if (raw === undefined || raw === null || raw === "") return new Date(NaN);
  const value = String(raw).trim();
  const delimited = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
  if (delimited) {
    const first = Number(delimited[1]);
    const second = Number(delimited[2]);
    const yearPart = Number(delimited[3]);
    const year = yearPart < 100 ? 2000 + yearPart : yearPart;
    const usesMonthFirst = second > 12;
    const day = usesMonthFirst ? second : first;
    const month = usesMonthFirst ? first : second;
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      return parsed;
    }
    return new Date(NaN);
  }

  return new Date(value);
}

export const parseCSV = (filePath: string): Promise<ParsedTransaction[]> => {
  return new Promise((resolve, reject) => {
    const results: ParsedTransaction[] = [];
    let merchantKey: string | undefined;
    let amountKey: string | undefined;
    let dateKey: string | undefined;

    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, relax_column_count: true }))
      .on("data", (row: Record<string, unknown>) => {
        // Resolve column mapping from header names (first row)
        if (merchantKey === undefined) {
          const headers = Object.keys(row);
          merchantKey =
            findColumnKey(headers, MERCHANT_COLUMN_ALIASES) ?? headers[0];
          amountKey =
            findColumnKey(headers, AMOUNT_COLUMN_ALIASES) ?? headers.find((h) => h.toLowerCase().includes("amount")) ?? "amount";
          dateKey =
            findColumnKey(headers, DATE_COLUMN_ALIASES) ?? headers.find((h) => h.toLowerCase().includes("date")) ?? "date";
        }

        const mk = merchantKey ?? "merchant";
        const ak = amountKey ?? "amount";
        const dk = dateKey ?? "date";
        const rawMerchant = row[mk] ?? row.merchant ?? row.description ?? "";
        const merchant = String(rawMerchant ?? "").trim() || "Unknown";
        const amount = parseAmount(row[ak] ?? row.amount);
        const date = parseDate(row[dk] ?? row.date);

        if (!merchant || amount <= 0 || Number.isNaN(date.getTime())) return;

        results.push({
          merchant,
          amount,
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

  if (ext === ".csv") {
    const transactions = await parseCSV(filePath);
    if (transactions.length === 0) {
      throw new Error(
        "No transactions found in CSV. Check that the file includes date, merchant, and amount columns."
      );
    }
    return transactions;
  }
  if (ext === ".pdf" || isPdfMime) return parsePDF(filePath);

  throw new Error("Unsupported statement format. Please upload CSV or PDF.");
}

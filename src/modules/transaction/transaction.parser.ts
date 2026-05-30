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
  "transaction amount",
  "transaction amount (inr)",
];

const DEBIT_COLUMN_ALIASES = ["debit", "debit amount", "withdrawal", "withdrawal amount"];
const CREDIT_COLUMN_ALIASES = ["credit", "credit amount", "deposit", "deposit amount"];

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
  const d = new Date(String(raw).trim());
  return d;
}

function findAmountLikeColumn(headers: string[]): string | undefined {
  return headers.find((h) => {
    const normalized = h.toLowerCase();
    return normalized.includes("amount") && !normalized.includes("balance");
  });
}

function parseFirstPresentAmount(row: Record<string, unknown>, keys: Array<string | undefined>): number {
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const raw = row[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;

    const amount = parseAmount(raw);
    if (amount > 0) return amount;
  }

  return 0;
}

export const parseCSV = (filePath: string): Promise<ParsedTransaction[]> => {
  return new Promise((resolve, reject) => {
    const results: ParsedTransaction[] = [];
    let merchantKey: string | undefined;
    let amountKey: string | undefined;
    let debitKey: string | undefined;
    let creditKey: string | undefined;
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
            findColumnKey(headers, AMOUNT_COLUMN_ALIASES) ?? findAmountLikeColumn(headers);
          debitKey = findColumnKey(headers, DEBIT_COLUMN_ALIASES);
          creditKey = findColumnKey(headers, CREDIT_COLUMN_ALIASES);
          dateKey =
            findColumnKey(headers, DATE_COLUMN_ALIASES) ?? headers.find((h) => h.toLowerCase().includes("date")) ?? "date";
        }

        const mk = merchantKey ?? "merchant";
        const dk = dateKey ?? "date";
        const rawMerchant = row[mk] ?? row.merchant ?? row.description ?? "";
        const merchant = String(rawMerchant ?? "").trim() || "Unknown";
        const amount = parseFirstPresentAmount(row, [amountKey, "amount", debitKey, creditKey]);
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

  if (ext === ".csv") return parseCSV(filePath);
  if (ext === ".pdf" || isPdfMime) return parsePDF(filePath);

  throw new Error("Unsupported statement format. Please upload CSV or PDF.");
}

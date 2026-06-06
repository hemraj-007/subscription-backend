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

const DEBIT_COLUMN_ALIASES = [
  "debit",
  "debit amount",
  "withdrawal",
  "withdrawal amount",
  "paid out",
  "paid out amount",
  "dr",
];

const CREDIT_COLUMN_ALIASES = [
  "credit",
  "credit amount",
  "deposit",
  "deposit amount",
  "paid in",
  "paid in amount",
  "cr",
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
    headerKeys.map((k) => [normalizeHeader(k), k])
  );
  for (const alias of aliases) {
    if (normalized.has(normalizeHeader(alias))) return normalized.get(normalizeHeader(alias));
  }
  return undefined;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim();
}

function isBalanceColumn(header: string): boolean {
  const normalized = normalizeHeader(header);
  return normalized === "balance" || normalized.includes("balance");
}

function findGenericAmountColumn(headerKeys: string[]): string | undefined {
  return headerKeys.find((header) => {
    const normalized = normalizeHeader(header);
    return (
      normalized.includes("amount") &&
      !normalized.includes("debit") &&
      !normalized.includes("credit") &&
      !isBalanceColumn(header)
    );
  });
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

function parseRowAmount(
  row: Record<string, unknown>,
  amountKeys: string[]
): number {
  for (const key of amountKeys) {
    const amount = parseAmount(row[key]);
    if (amount > 0) return amount;
  }
  return 0;
}

export const parseCSV = (filePath: string): Promise<ParsedTransaction[]> => {
  return new Promise((resolve, reject) => {
    const results: ParsedTransaction[] = [];
    let merchantKey: string | undefined;
    let amountKeys: string[] | undefined;
    let dateKey: string | undefined;

    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, relax_column_count: true }))
      .on("data", (row: Record<string, unknown>) => {
        // Resolve column mapping from header names (first row)
        if (merchantKey === undefined) {
          const headers = Object.keys(row);
          merchantKey =
            findColumnKey(headers, MERCHANT_COLUMN_ALIASES) ?? headers[0];
          const amountCandidates = [
            findColumnKey(headers, AMOUNT_COLUMN_ALIASES) ??
              findGenericAmountColumn(headers),
            findColumnKey(headers, DEBIT_COLUMN_ALIASES),
            findColumnKey(headers, CREDIT_COLUMN_ALIASES),
          ].filter(
            (key): key is string =>
              typeof key === "string" && !isBalanceColumn(key)
          );
          amountKeys = Array.from(new Set(amountCandidates));
          dateKey =
            findColumnKey(headers, DATE_COLUMN_ALIASES) ??
            headers.find((h) => normalizeHeader(h).includes("date")) ??
            "date";
        }

        const mk = merchantKey ?? "merchant";
        const dk = dateKey ?? "date";
        const rawMerchant = row[mk] ?? row.merchant ?? row.description ?? "";
        const merchant = String(rawMerchant ?? "").trim() || "Unknown";
        const amount = parseRowAmount(row, amountKeys ?? ["amount"]);
        const date = parseDate(row[dk] ?? row.date);

        if (!merchant || amount <= 0 || Number.isNaN(date.getTime())) return;

        results.push({
          merchant,
          amount,
          date,
        });
      })
      .on("end", () => {
        if (results.length === 0) {
          reject(
            new Error(
              "No transactions found in CSV. Check that the file includes date, merchant, and amount/debit/credit columns."
            )
          );
          return;
        }
        resolve(results);
      })
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

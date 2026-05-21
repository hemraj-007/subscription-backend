import { ParsedTransaction } from "./transaction.types";

// Allow dates immediately followed by letters (pdf-parse often omits spaces).
const DATE_PATTERN =
  /(\d{1,2}[\s./-](?:\d{1,2}|[A-Za-z]{3,9})[\s./-]\d{2,4}|\d{4}[\s./-]\d{1,2}[\s./-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})(?!\d)/i;

const DATE_AT_LINE_START = /^(\d{1,2}-[A-Za-z]{3,9}-\d{4})/i;

const AMOUNT_AT_END =
  /(\d{1,3}(?:,\d{2})*(?:,\d{3})?|\d{1,3}(?:,\d{3})+|\d{2,6})$/;

const AMOUNT_PATTERN =
  /(?:₹|Rs\.?|INR\s*)?([+-]?\(?\d[\d,]*(?:\.\d{1,2})?\)?)\s*(?:CR|DR|Cr|Dr)?/gi;

const SKIP_LINE_PATTERN =
  /\b(statement period|total debits|total credits|page \d+ of|account summary|available (?:credit )?limit|minimum (?:amount )?due|payment due|previous balance|brought forward|carried forward)\b/i;

const SKIP_MERCHANT_PATTERN = /^(opening balance|closing balance)$/i;

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
  "remarks",
  "memo",
];

const AMOUNT_COLUMN_ALIASES = [
  "amount",
  "debit",
  "credit",
  "withdrawal",
  "deposit",
  "transaction amount",
  "debit amount",
  "credit amount",
  "transaction amount (inr)",
  "txn amount",
];

const DATE_COLUMN_ALIASES = [
  "date",
  "transaction date",
  "posting date",
  "value date",
  "trans date",
  "transaction date (posting)",
  "booking date",
  "txn date",
];

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (let i = 0; i < normalized.length; i++) {
    const header = normalized[i];
    for (const alias of aliases) {
      if (header === alias || header.includes(alias)) return i;
    }
  }
  return -1;
}

function compactRow(row: string[]): string[] {
  return row.map((cell) => cell.trim()).filter((cell) => cell.length > 0);
}

function parseAmount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  let s = String(raw).trim().replace(/,/g, "");
  const negative = s.startsWith("(") && s.endsWith(")");
  if (negative) s = s.slice(1, -1);
  s = s.replace(/[₹]|Rs\.?|INR/gi, "").trim();
  const n = Number(s.replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return 0;
  return Math.abs(n);
}

function parseDateFromText(raw: string): Date {
  const cleaned = raw.replace(/\./g, "/").replace(/\s+/g, " ").trim();
  const slashParts = cleaned.split(/[/-]/).map((p) => p.trim());

  if (slashParts.length === 3) {
    if (slashParts[0].length === 4) {
      const [y, m, d] = slashParts.map(Number);
      return new Date(y, m - 1, d);
    }

    const [dStr, rawMonth, yStr] = slashParts;
    const monthNames = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const monthFromName =
      monthNames.indexOf(rawMonth.slice(0, 3).toLowerCase()) + 1;
    const monthNumeric = Number(rawMonth);
    const month = Number.isNaN(monthNumeric) ? monthFromName : monthNumeric;
    const y = yStr.length === 2 ? Number(`20${yStr}`) : Number(yStr);
    return new Date(y, month - 1, Number(dStr));
  }

  const spaced = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
  if (spaced) {
    return parseDateFromText(
      `${spaced[1]}/${spaced[2]}/${spaced[3]}`
    );
  }

  return new Date(cleaned);
}

function isSkippableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (SKIP_LINE_PATTERN.test(trimmed)) return true;
  if (/^date\b/i.test(trimmed) && /\b(?:amount|debit|credit|balance)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

function peelAmountsFromEnd(text: string): { merchant: string; amounts: number[] } {
  const amounts: number[] = [];
  let rest = text.trim();

  while (rest.length > 0) {
    const match = rest.match(AMOUNT_AT_END);
    if (!match) break;
    amounts.unshift(parseAmount(match[1]));
    rest = rest.slice(0, rest.length - match[1].length);
  }

  return { merchant: rest.replace(/\s+/g, " ").trim(), amounts };
}

function parseCompressedStatementLine(line: string): ParsedTransaction | null {
  const match = line.match(/^(\d{1,2}-[A-Za-z]{3,9}-\d{4})(.*)$/i);
  if (!match) return null;

  const date = parseDateFromText(match[1]);
  if (Number.isNaN(date.getTime())) return null;

  const { merchant, amounts } = peelAmountsFromEnd(match[2]);
  if (amounts.length === 0) return null;
  if (!merchant) return null;
  if (SKIP_MERCHANT_PATTERN.test(merchant)) return null;

  // With debit/credit + balance, the first peeled amount is the transaction value.
  const amount = amounts[0];
  if (amount <= 0) return null;

  return { merchant, amount, date };
}

function findAmountInText(
  text: string,
  prefer: "first" | "last" = "first"
): { amount: number; token: string } | null {
  const matches = Array.from(text.matchAll(AMOUNT_PATTERN));
  if (matches.length === 0) return null;

  const ordered =
    prefer === "first" ? matches : [...matches].reverse();

  for (const match of ordered) {
    const token = match[0] ?? "";
    const numeric = match[1] ?? token;
    const amount = parseAmount(numeric);
    if (amount > 0) return { amount, token };
  }

  return null;
}

function parseLineToTransaction(line: string): ParsedTransaction | null {
  if (isSkippableLine(line)) return null;

  const compressed = parseCompressedStatementLine(line);
  if (compressed) return compressed;

  const dateMatch = line.match(DATE_PATTERN);
  if (!dateMatch) return null;

  const date = parseDateFromText(dateMatch[1]);
  if (Number.isNaN(date.getTime())) return null;

  const dateIdx = line.indexOf(dateMatch[0]);
  const afterDate =
    dateIdx >= 0 ? line.slice(dateIdx + dateMatch[0].length).trim() : line;

  // First amount after the date is usually the txn; trailing values are often balances.
  const amountInfo = findAmountInText(afterDate, "first");
  if (!amountInfo) return null;

  const amountIdx = afterDate.indexOf(amountInfo.token);
  const merchantSlice =
    amountIdx >= 0
      ? afterDate.slice(0, amountIdx)
      : afterDate.replace(amountInfo.token, "");
  const merchant = merchantSlice.replace(/\s+/g, " ").trim() || "Unknown";

  return { merchant, amount: amountInfo.amount, date };
}

function findHeaderRowIndex(rows: string[][]): number {
  const scanLimit = Math.min(rows.length, 80);
  for (let i = 0; i < scanLimit; i++) {
    const joined = rows[i].join(" ").toLowerCase();
    const hasDate = DATE_COLUMN_ALIASES.some((alias) => joined.includes(alias));
    const hasAmount = AMOUNT_COLUMN_ALIASES.some((alias) =>
      joined.includes(alias)
    );
    const hasMerchant = MERCHANT_COLUMN_ALIASES.some((alias) =>
      joined.includes(alias)
    );
    if (hasDate && (hasAmount || hasMerchant)) return i;
  }
  return -1;
}

function findAmountInRow(row: string[], skipIndexes: number[]): number {
  let best = 0;
  for (let i = 0; i < row.length; i++) {
    if (skipIndexes.includes(i)) continue;
    const amount = parseAmount(row[i]);
    if (amount > best) best = amount;
  }
  return best;
}

function parseFromCompactTableRows(rows: string[][]): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];

  for (const rawRow of rows) {
    const cells = compactRow(rawRow);
    if (cells.length < 3) continue;
    if (!DATE_AT_LINE_START.test(cells[0])) continue;

    const date = parseDateFromText(cells[0].match(DATE_AT_LINE_START)![1]);
    if (Number.isNaN(date.getTime())) continue;

    const merchant = cells[1]?.replace(/\s+/g, " ").trim() || "Unknown";
    if (SKIP_MERCHANT_PATTERN.test(merchant)) continue;

    // Typical layout: Date | Description | Debit/Credit | Balance
    const numericCells = cells.slice(2).map((c) => parseAmount(c));
    const nonZero = numericCells.filter((n) => n > 0);
    if (nonZero.length === 0) continue;

    const amount = nonZero[0];
    results.push({ merchant, amount, date });
  }

  return results;
}

function parseFromTableRows(rows: string[][]): ParsedTransaction[] {
  const compactResults = parseFromCompactTableRows(rows);
  if (compactResults.length > 0) return compactResults;

  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx < 0) return [];

  const headers = rows[headerIdx];
  const dateCol = findColumnIndex(headers, DATE_COLUMN_ALIASES);
  const debitCol = findColumnIndex(headers, ["debit"]);
  const creditCol = findColumnIndex(headers, ["credit"]);
  const amountCol = findColumnIndex(headers, AMOUNT_COLUMN_ALIASES);
  const merchantCol = findColumnIndex(headers, MERCHANT_COLUMN_ALIASES);
  const balanceCol = findColumnIndex(headers, ["balance"]);

  if (dateCol < 0) return [];

  const results: ParsedTransaction[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const line = row.join(" ");
    if (isSkippableLine(line)) continue;

    const dateRaw = row[dateCol] ?? "";
    if (!DATE_PATTERN.test(dateRaw) && !DATE_PATTERN.test(line)) continue;

    const dateMatch =
      dateRaw.match(DATE_PATTERN) ?? line.match(DATE_PATTERN);
    const date = parseDateFromText(dateMatch?.[1] ?? dateRaw);
    if (Number.isNaN(date.getTime())) continue;

    let amount = 0;
    if (debitCol >= 0) amount = parseAmount(row[debitCol]);
    if (amount <= 0 && creditCol >= 0) amount = parseAmount(row[creditCol]);
    if (amount <= 0 && amountCol >= 0) amount = parseAmount(row[amountCol]);
    if (amount <= 0) {
      const skip = [dateCol, merchantCol, balanceCol].filter((i) => i >= 0);
      amount = findAmountInRow(row, skip);
    }
    if (amount <= 0) continue;

    let merchant =
      merchantCol >= 0 ? String(row[merchantCol] ?? "").trim() : "";
    if (!merchant) {
      const parts = row.filter(
        (_, idx) =>
          idx !== dateCol && idx !== debitCol && idx !== creditCol && idx !== balanceCol
      );
      merchant = compactRow(parts).join(" ").replace(/\s+/g, " ").trim();
    }
    if (!merchant) merchant = "Unknown";
    if (SKIP_MERCHANT_PATTERN.test(merchant)) continue;

    results.push({ merchant, amount, date });
  }

  return results;
}

function parseFromLines(lines: string[]): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  let pendingMerchant = "";

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;

    const parsed = parseLineToTransaction(line);
    if (parsed) {
      if (pendingMerchant && parsed.merchant === "Unknown") {
        parsed.merchant = pendingMerchant;
      }
      results.push(parsed);
      pendingMerchant = "";
      continue;
    }

    if (!isSkippableLine(line) && !DATE_PATTERN.test(line) && line.length > 2) {
      pendingMerchant = pendingMerchant
        ? `${pendingMerchant} ${line}`.trim()
        : line;
    }
  }

  return results;
}

function dedupeTransactions(transactions: ParsedTransaction[]): ParsedTransaction[] {
  const seen = new Set<string>();
  const unique: ParsedTransaction[] = [];

  for (const tx of transactions) {
    const key = `${tx.date.toISOString().slice(0, 10)}|${tx.merchant.toLowerCase()}|${tx.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(tx);
  }

  return unique;
}

export function parseTransactionsFromPdfContent(
  text: string,
  rows: string[][]
): ParsedTransaction[] {
  const fromCompact = parseFromCompactTableRows(rows);
  if (fromCompact.length > 0) {
    return dedupeTransactions(fromCompact);
  }

  const fromTable = parseFromTableRows(rows);
  const lineSource =
    rows.length > 0
      ? rows.map((row) => (row.length === 1 ? row[0] : row.join(" | ")))
      : text.split(/\r?\n/);

  const fromLines = parseFromLines(lineSource);
  const merged = dedupeTransactions([...fromTable, ...fromLines]);

  if (merged.length > 0) return merged;

  return dedupeTransactions(parseFromLines(text.split(/\r?\n/)));
}

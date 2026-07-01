import { ParsedTransaction, TransactionKind } from "./transaction.types";

// Allow dates immediately followed by letters (pdf-parse often omits spaces).
const DATE_PATTERN =
  /(\d{1,2}[\s./-](?:\d{1,2}|[A-Za-z]{3,9})[\s./-]\d{2,4}|\d{4}[\s./-]\d{1,2}[\s./-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})(?!\d)/i;

const DATE_AT_LINE_START =
  /^(\d{1,2}-[A-Za-z]{3,9})(?:-(\d{2,4}))?\b/i;

/** First signed amount after the date — txn value; trailing values are often running balances. */
const TXN_SIGNED_AMOUNT =
  /([+-]\s*\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)/;

/** Any money-like token: grouped (1,24,351 / 48,000) or plain digits, optional sign/decimals. */
const MONEY_TOKEN = /[+-]?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?/g;

/** Reject parsed values above this (10 crore) — almost certainly a ref/account number, not an amount. */
const MAX_REASONABLE_AMOUNT = 100_000_000;

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
  const abs = Math.abs(n);
  if (abs > MAX_REASONABLE_AMOUNT) return 0;
  return abs;
}

function inferStatementYear(text: string): number {
  const period = text.match(
    /statement\s+period[^\d]{0,40}(\d{1,2}\s+[A-Za-z]{3,9}\s+(20\d{2}))[^\d]{0,40}(\d{1,2}\s+[A-Za-z]{3,9}\s+(20\d{2}))/i
  );
  if (period) return Number(period[4] ?? period[2]);

  const years = text.match(/\b(20\d{2})\b/g);
  if (years?.length) return Number(years[years.length - 1]);

  return new Date().getFullYear();
}

function parseLeadingDate(
  line: string,
  defaultYear: number
): { date: Date; rest: string } | null {
  const withYear = line.match(/^(\d{1,2}-[A-Za-z]{3,9}-\d{4})\b(.*)$/i);
  if (withYear) {
    const date = parseDateFromText(withYear[1]);
    if (!Number.isNaN(date.getTime())) {
      return { date, rest: withYear[2] ?? "" };
    }
  }

  const ddMon = line.match(/^(\d{1,2}-[A-Za-z]{3,9})\b(.*)$/i);
  if (ddMon) {
    const date = parseDateFromText(`${ddMon[1]}-${defaultYear}`);
    if (!Number.isNaN(date.getTime())) {
      return { date, rest: ddMon[2] ?? "" };
    }
  }

  return null;
}

function parseDateFromText(raw: string): Date {
  const cleaned = raw.replace(/\./g, "/").replace(/\s+/g, " ").trim();
  const slashParts = cleaned.split(/[/-]/).map((p) => p.trim());

  if (slashParts.length === 3) {
    if (slashParts[0].length === 4) {
      const [y, m, d] = slashParts.map(Number);
      if (m < 1 || m > 12) return new Date(NaN);
      // Build in UTC so later .toISOString() does not shift the calendar day.
      return new Date(Date.UTC(y, m - 1, d));
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
    if (month < 1 || month > 12) return new Date(NaN);
    const y = yStr.length === 2 ? Number(`20${yStr}`) : Number(yStr);
    return new Date(Date.UTC(y, month - 1, Number(dStr)));
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

function parseMerchantAndAmount(
  rest: string
): { merchant: string; amount: number; type: TransactionKind } | null {
  const trimmed = rest.trim();
  if (!trimmed) return null;

  // Prefer an explicitly signed amount: it is the transaction value, while a
  // trailing unsigned number is usually the running balance. By convention here
  // a leading "-" is money out (DEBIT) and "+" is money in (CREDIT).
  const signed = trimmed.match(TXN_SIGNED_AMOUNT);
  if (signed && signed.index !== undefined) {
    const amount = parseAmount(signed[1]);
    const type: TransactionKind = signed[1].trim().startsWith("+") ? "CREDIT" : "DEBIT";
    const merchant = trimmed.slice(0, signed.index).replace(/\s+/g, " ").trim();
    if (amount > 0 && merchant) return { merchant, amount, type };
  }

  // No sign present (e.g. "Netflix 649" or "Netflix 649 1,24,351"): take the
  // first money-like token as the transaction value (balance, if any, trails it).
  const tokens = Array.from(trimmed.matchAll(MONEY_TOKEN));
  for (const token of tokens) {
    if (token.index === undefined) continue;
    const amount = parseAmount(token[0]);
    if (amount <= 0) continue;
    const merchant = trimmed.slice(0, token.index).replace(/\s+/g, " ").trim();
    if (merchant) return { merchant, amount, type: "DEBIT" };
  }

  return null;
}

function parseCompressedStatementLine(
  line: string,
  defaultYear: number
): ParsedTransaction | null {
  const leading = parseLeadingDate(line, defaultYear);
  if (!leading) return null;

  const parsed = parseMerchantAndAmount(leading.rest);
  if (!parsed) return null;
  if (SKIP_MERCHANT_PATTERN.test(parsed.merchant)) return null;

  return {
    merchant: parsed.merchant,
    amount: parsed.amount,
    type: parsed.type,
    date: leading.date,
  };
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

function parseLineToTransaction(
  line: string,
  defaultYear: number
): ParsedTransaction | null {
  if (isSkippableLine(line)) return null;

  const compressed = parseCompressedStatementLine(line, defaultYear);
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

  return { merchant, amount: amountInfo.amount, type: "DEBIT", date };
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

function parseFromCompactTableRows(
  rows: string[][],
  defaultYear: number
): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];

  for (const rawRow of rows) {
    const cells = compactRow(rawRow);
    if (cells.length < 2) continue;

    const joined = cells.join(" ");
    const leading = parseLeadingDate(joined, defaultYear);
    if (!leading) continue;

    const date = leading.date;

    const parsed = parseMerchantAndAmount(leading.rest);
    if (!parsed) continue;
    const resolvedMerchant =
      parsed.merchant || cells[1]?.replace(/\s+/g, " ").trim() || "Unknown";
    if (SKIP_MERCHANT_PATTERN.test(resolvedMerchant)) continue;

    results.push({
      merchant: resolvedMerchant,
      amount: parsed.amount,
      type: parsed.type,
      date,
    });
  }

  return results;
}

/**
 * Parses a table that has an explicit header row (Date / Description / Debit /
 * Credit / Balance ...). This is the most reliable shape because it can tell
 * debit columns from credit columns; callers should prefer it over the
 * column-agnostic compact parser, which would otherwise tag every row DEBIT.
 */
function parseFromHeaderTable(
  rows: string[][],
  defaultYear: number
): ParsedTransaction[] {
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
    let type: TransactionKind = "DEBIT";
    if (debitCol >= 0) amount = parseAmount(row[debitCol]);
    if (amount <= 0 && creditCol >= 0) {
      amount = parseAmount(row[creditCol]);
      if (amount > 0) type = "CREDIT";
    }
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

    results.push({ merchant, amount, type, date });
  }

  return results;
}

function parseFromLines(lines: string[], defaultYear: number): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  let pendingMerchant = "";

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;

    const parsed = parseLineToTransaction(line, defaultYear);
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

function rowsToText(rows: string[][]): string {
  return rows.map((row) => row.join(" | ")).join("\n");
}

export function parseTransactionsFromPdfContent(
  text: string,
  rows: string[][]
): ParsedTransaction[] {
  const defaultYear = inferStatementYear([text, rowsToText(rows)].join("\n"));

  // Prefer an explicit header table: it is the only shape that reliably
  // distinguishes debit from credit columns. Listed first so its credit/debit
  // classification wins during dedupe over the column-agnostic parsers below.
  const fromHeader = parseFromHeaderTable(rows, defaultYear);

  // The compact parser handles compressed single-cell rows (and signed amounts).
  // Skip it when a header table already produced rows to avoid DEBIT-tagging credits.
  const fromCompact =
    fromHeader.length > 0 ? [] : parseFromCompactTableRows(rows, defaultYear);

  const lineSource =
    rows.length > 0
      ? rows.map((row) => (row.length === 1 ? row[0] : row.join(" | ")))
      : text.split(/\r?\n/);

  const fromLines = parseFromLines(lineSource, defaultYear);
  const merged = dedupeTransactions([
    ...fromHeader,
    ...fromCompact,
    ...fromLines,
  ]);

  if (merged.length > 0) return merged;

  return dedupeTransactions(parseFromLines(text.split(/\r?\n/), defaultYear));
}

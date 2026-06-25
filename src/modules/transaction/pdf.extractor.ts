import fs from "fs";
import type { PDFExtract as PDFExtractType } from "pdf.js-extract";
import pdfParse from "pdf-parse";

export interface PdfExtractResult {
  text: string;
  rows: string[][];
  method: "pdf.js-extract" | "pdf-parse";
}

const LINE_Y_TOLERANCE = 6;

type PDFExtractCtor = typeof PDFExtractType;

let pdfExtractLoader: Promise<{
  extractor: PDFExtractType;
  PDFExtract: PDFExtractCtor;
}> | null = null;

function loadPdfJsExtract() {
  if (!pdfExtractLoader) {
    pdfExtractLoader = (async () => {
      // pdf.js-extract's CJS entry resolves to a Promise<typeof PDFExtract>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const PDFExtract = (await require("pdf.js-extract")) as PDFExtractCtor;
      return { extractor: new PDFExtract(), PDFExtract };
    })();
  }
  return pdfExtractLoader;
}

function rowsFromExtractedPages(
  PDFExtract: PDFExtractCtor,
  pages: Awaited<ReturnType<PDFExtractType["extractBuffer"]>>["pages"]
): string[][] {
  const allRows = PDFExtract.utils.extractAllPagesTextRows(pages, LINE_Y_TOLERANCE);
  const flat: string[][] = [];

  for (const pageRows of allRows) {
    for (const row of pageRows) {
      const cells = row
        .map((cell) => (cell ?? "").replace(/\s+/g, " ").trim())
        .filter((cell) => cell.length > 0);
      if (cells.length > 0) flat.push(cells);
    }
  }

  return flat;
}

function textFromExtractedPages(
  PDFExtract: PDFExtractCtor,
  pages: Awaited<ReturnType<PDFExtractType["extractBuffer"]>>["pages"]
): string {
  return pages
    .map((page) => {
      const lines = PDFExtract.utils.pageToLines(page, LINE_Y_TOLERANCE);
      return lines
        .map((line) =>
          line
            .map((item) => item.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function textFromRows(rows: string[][]): string {
  return rows.map((row) => row.join(" | ")).join("\n");
}

function linesFromPlainText(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => [line]);
}

function compactRow(row: string[]): string[] {
  return row.map((cell) => cell.trim()).filter((cell) => cell.length > 0);
}

function scoreExtractedContent(text: string, rows: string[][]): number {
  const printable = text.replace(/\s/g, "").length;
  const rowScore = rows.reduce((sum, row) => sum + row.join("").length, 0);
  const namedDateHits = (
    text.match(/\d{1,2}[-/][A-Za-z]{3,9}[-/]\d{2,4}/gi) ?? []
  ).length;
  const numericDateHits = (
    text.match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g) ?? []
  ).length;
  const structuredTxnRows = rows
    .map(compactRow)
    .filter((cells) =>
      /^\d{1,2}-[A-Za-z]{3,9}(?:-\d{2,4})?\b/i.test(cells[0] ?? cells.join(" "))
    )
    .length;

  return (
    printable +
    rowScore * 0.5 +
    structuredTxnRows * 200 +
    namedDateHits * 50 +
    numericDateHits * 30
  );
}

async function extractWithPdfJsExtract(buffer: Buffer): Promise<PdfExtractResult | null> {
  const { extractor, PDFExtract } = await loadPdfJsExtract();
  const data = await extractor.extractBuffer(buffer, {
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  });

  const rows = rowsFromExtractedPages(PDFExtract, data.pages);
  const layoutText = textFromExtractedPages(PDFExtract, data.pages);
  const rowText = textFromRows(rows);
  const text =
    scoreExtractedContent(rowText, rows) >= scoreExtractedContent(layoutText, rows)
      ? rowText
      : layoutText;

  if (text.trim().length < 15 && rows.length < 2) return null;

  return { text, rows, method: "pdf.js-extract" };
}

async function extractWithPdfParse(buffer: Buffer): Promise<PdfExtractResult | null> {
  const pdf = await pdfParse(buffer);
  const text = typeof pdf.text === "string" ? pdf.text.trim() : "";
  if (text.length < 15) return null;
  return { text, rows: linesFromPlainText(text), method: "pdf-parse" };
}

function countStructuredTransactionRows(rows: string[][]): number {
  return rows
    .map(compactRow)
    .filter((cells) =>
      /^\d{1,2}-[A-Za-z]{3,9}(?:-\d{2,4})?\b/i.test(cells[0] ?? cells.join(" "))
    )
    .length;
}

export async function extractPdfContent(filePath: string): Promise<PdfExtractResult> {
  const buffer = fs.readFileSync(filePath);

  let jsExtract: PdfExtractResult | null = null;
  let parseExtract: PdfExtractResult | null = null;

  try {
    jsExtract = await extractWithPdfJsExtract(buffer);
  } catch {
    // fall through
  }

  try {
    parseExtract = await extractWithPdfParse(buffer);
  } catch {
    // fall through
  }

  const jsStructured = jsExtract ? countStructuredTransactionRows(jsExtract.rows) : 0;

  if (jsExtract && jsStructured >= 2) {
    return {
      text: parseExtract?.text ?? jsExtract.text,
      rows: jsExtract.rows,
      method: "pdf.js-extract",
    };
  }

  const candidates = [jsExtract, parseExtract].filter(
    (r): r is PdfExtractResult => r !== null
  );
  let best: PdfExtractResult | null = null;
  let bestScore = 0;

  for (const result of candidates) {
    const score = scoreExtractedContent(result.text, result.rows);
    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
  }

  if (best) return best;

  throw new Error(
    "Could not read text from this PDF. Scanned/image-only statements are not supported yet — please upload a text-based PDF or CSV export from your bank."
  );
}

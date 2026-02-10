import fs from "fs";
import { parse } from "csv-parse";

export interface ParsedTransaction {
  merchant: string;
  amount: number;
  date: Date;
}

export const parseCSV = (filePath: string): Promise<ParsedTransaction[]> => {
  return new Promise((resolve, reject) => {
    const results: ParsedTransaction[] = [];

    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true }))
      .on("data", (row) => {
        results.push({
          merchant: row.merchant || row.description,
          amount: Math.abs(Number(row.amount)),
          date: new Date(row.date),
        });
      })
      .on("end", () => resolve(results))
      .on("error", reject);
  });
};
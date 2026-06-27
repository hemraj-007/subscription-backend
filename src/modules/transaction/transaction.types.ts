export type TransactionKind = "DEBIT" | "CREDIT";

export interface ParsedTransaction {
  merchant: string;
  amount: number;
  /** DEBIT = money out (spend), CREDIT = money in (salary, refunds). */
  type: TransactionKind;
  date: Date;
}

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseTransactionsFromPdfContent } from "./statement-text.parser";
import { ParsedTransaction } from "./transaction.types";

const PERIOD = "Statement Period 01 May 2026 - 31 May 2026";

function fromLines(lines: string[]): ParsedTransaction[] {
  const text = [PERIOD, ...lines].join("\n");
  return parseTransactionsFromPdfContent(text, []);
}

function find(txs: ParsedTransaction[], merchantPart: string): ParsedTransaction {
  const match = txs.find((t) =>
    t.merchant.toLowerCase().includes(merchantPart.toLowerCase())
  );
  assert.ok(match, `expected a transaction matching "${merchantPart}"`);
  return match!;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

test("DD-Mon date infers statement year without a timezone off-by-one", () => {
  const txs = fromLines(["03-May Netflix Subscription -649 1,24,351"]);
  const netflix = find(txs, "Netflix");
  // The calendar day must survive the .toISOString() (UTC) round-trip used for storage/dedupe.
  assert.equal(isoDay(netflix.date), "2026-05-03");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");
});

test("unsigned DD-Mon amount lines are parsed", () => {
  const txs = fromLines(["04-May Spotify Premium 119 1,24,232"]);
  const spotify = find(txs, "Spotify");
  assert.equal(spotify.amount, 119);
  assert.equal(spotify.type, "DEBIT");
});

test("Indian digit grouping is parsed as a single amount", () => {
  const txs = fromLines(["05-May Annual Insurance -1,24,351 0"]);
  const ins = find(txs, "Insurance");
  assert.equal(ins.amount, 124351);
});

test("signed credit lines are tagged CREDIT", () => {
  const txs = fromLines(["01-May Salary Credit +48,000 1,25,000"]);
  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");
});

test("long reference numbers are not read as the amount", () => {
  const txs = fromLines(["10-May Ref 1234567890123 Amazon 299 1,20,000"]);
  const amazon = find(txs, "Amazon");
  assert.equal(amazon.amount, 299);
});

test("header tables distinguish debit and credit columns", () => {
  const rows = [
    ["Date", "Description", "Debit", "Credit", "Balance"],
    ["03/05/2026", "Netflix", "649", "", "124351"],
    ["01/05/2026", "Salary", "", "48000", "125000"],
  ];
  const txs = parseTransactionsFromPdfContent("", rows);

  const netflix = find(txs, "Netflix");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");
  assert.equal(isoDay(netflix.date), "2026-05-03");

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");
});

test("compressed single-cell table rows parse like lines", () => {
  const rows = [
    [PERIOD],
    ["03-May Netflix Subscription -649 1,24,351"],
    ["01-May Salary Credit +48,000 1,25,000"],
  ];
  const txs = parseTransactionsFromPdfContent(PERIOD, rows);

  const netflix = find(txs, "Netflix");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");

  const salary = find(txs, "Salary");
  assert.equal(salary.type, "CREDIT");
});

test("Type / Dr-Cr column classifies single Amount column credits", () => {
  const rows = [
    ["Date", "Description", "Amount", "Type", "Balance"],
    ["01/05/2026", "NEFT Salary", "48000", "Cr", "125000"],
    ["03/05/2026", "Netflix", "649", "Dr", "124351"],
  ];
  const txs = parseTransactionsFromPdfContent("", rows);

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");

  const netflix = find(txs, "Netflix");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");
});

test("Dr/Cr column header classifies credits and debits", () => {
  const rows = [
    ["Date", "Narration", "Amount", "Dr/Cr"],
    ["01/05/2026", "Salary Credit", "48000", "CR"],
    ["03/05/2026", "Spotify Premium", "119", "DR"],
  ];
  const txs = parseTransactionsFromPdfContent("", rows);

  const salary = find(txs, "Salary");
  assert.equal(salary.type, "CREDIT");
  assert.equal(salary.amount, 48000);

  const spotify = find(txs, "Spotify");
  assert.equal(spotify.type, "DEBIT");
  assert.equal(spotify.amount, 119);
});

test("amount cells with leading Cr./Dr. set direction", () => {
  const rows = [
    ["Date", "Narration", "Amount", "Balance"],
    ["01/05/2026", "Salary NEFT", "Cr. 48,000.00", "1,25,000.00"],
    ["03/05/2026", "Netflix", "Dr. 649.00", "1,24,351.00"],
  ];
  const txs = parseTransactionsFromPdfContent("", rows);

  const salary = find(txs, "Salary");
  assert.equal(salary.amount, 48000);
  assert.equal(salary.type, "CREDIT");

  const netflix = find(txs, "Netflix");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");
});

test("trailing CR/DR markers set transaction direction on unsigned lines", () => {
  const txs = fromLines([
    "01-May Payment Received 5000.00 CR 1,25,000",
    "03-May Netflix Subscription 649.00 DR 1,24,351",
  ]);

  const payment = find(txs, "Payment");
  assert.equal(payment.amount, 5000);
  assert.equal(payment.type, "CREDIT");

  const netflix = find(txs, "Netflix");
  assert.equal(netflix.amount, 649);
  assert.equal(netflix.type, "DEBIT");
});

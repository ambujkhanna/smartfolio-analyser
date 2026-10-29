import Papa from "papaparse";
import { validateTransaction, type CanonicalTransaction, type TransactionKind } from "../domain/transaction";

export interface CsvImportIssue {
  code: string;
  message: string;
  rowNumber?: number;
  field?: string;
}

export interface CsvPreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  status: "valid" | "invalid" | "needs-resolution";
  transaction?: CanonicalTransaction;
  issues: CsvImportIssue[];
}

export interface GenericCsvImportResult {
  fileName: string;
  headers: string[];
  rows: CsvPreviewRow[];
  transactions: CanonicalTransaction[];
  issues: CsvImportIssue[];
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  isComplete: boolean;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((header) => normalizedAliases.has(normalizeHeader(header)));
}

function valueAt(values: string[], headers: string[], aliases: string[]): string | undefined {
  const index = findHeaderIndex(headers, aliases);
  if (index < 0) return undefined;
  return values[index]?.trim() ?? "";
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return Number(value.trim().replace(/,/g, ""));
}

function parseKind(value: string | undefined): TransactionKind | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (["buy", "purchase", "b"].includes(normalized)) return "buy";
  if (["sell", "sale", "s"].includes(normalized)) return "sell";
  if (["openingbalance", "opening", "holding", "openingposition"].includes(normalized)) return "opening-balance";
  if (["fee", "fees", "charge", "charges", "brokerage"].includes(normalized)) return "fee";
  if (["dividend", "dividends", "dividendpayout"].includes(normalized)) return "dividend";
  return undefined;
}

function deterministicId(fileName: string, rowNumber: number, raw: Record<string, string>): string {
  const source = fileName + "|" + rowNumber + "|" + JSON.stringify(raw);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return "import:" + (hash >>> 0).toString(16).padStart(8, "0");
}

function rawRow(values: string[], headers: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
}

/**
 * Parses a generic CSV while preserving every non-empty data row for preview.
 * Only rows with a stable instrument identity and valid canonical fields are accepted
 * as transactions. Symbol-only rows remain visible as needs-resolution, not silently mapped.
 */
export function parseGenericCsv(csvText: string, fileName: string): GenericCsvImportResult {
  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: "greedy",
  });

  const records = parsed.data;
  const headers = (records[0] ?? []).map((header) => String(header ?? "").trim());
  const dataRecords = records.slice(1);
  const globalIssues: CsvImportIssue[] = parsed.errors.map((error) => ({
    code: "CSV_PARSE_ERROR",
    message: error.message,
    ...(typeof error.row === "number" ? { rowNumber: error.row + 1 } : {}),
  }));

  if (headers.length === 0 || headers.every((header) => !header)) {
    globalIssues.push({
      code: "MISSING_HEADER",
      message: "CSV must contain a header row with transaction columns.",
    });
  }

  const normalizedHeaders = headers.map(normalizeHeader);
  const duplicateHeaders = normalizedHeaders.filter(
    (header, index) => header && normalizedHeaders.indexOf(header) !== index,
  );
  if (duplicateHeaders.length > 0) {
    globalIssues.push({
      code: "DUPLICATE_HEADERS",
      message: "CSV contains duplicate column names after normalization: " + [...new Set(duplicateHeaders)].join(", "),
    });
  }

  const rows: CsvPreviewRow[] = [];
  const transactions: CanonicalTransaction[] = [];

  dataRecords.forEach((record, index) => {
    const rowNumber = index + 2;
    const values = record.map((value) => String(value ?? ""));
    const raw = rawRow(values, headers);
    const rowIssues: CsvImportIssue[] = [];

    if (globalIssues.some((issue) => issue.code === "MISSING_HEADER" || issue.code === "DUPLICATE_HEADERS")) {
      rowIssues.push({
        code: "AMBIGUOUS_CSV_HEADERS",
        rowNumber,
        message: "This row cannot be normalized because the CSV header row is missing or ambiguous.",
      });
      rows.push({ rowNumber, raw, status: "invalid", issues: rowIssues });
      return;
    }

    const kindText = valueAt(values, headers, ["kind", "type", "transactiontype", "tradetype", "action"]);
    const kind = parseKind(kindText);
    if (!kind) {
      rowIssues.push({
        code: "UNSUPPORTED_TRANSACTION_KIND",
        rowNumber,
        field: "kind",
        message: "Transaction type is missing or unsupported: " + (kindText || "(empty)"),
      });
    }

    const explicitInstrumentId = valueAt(values, headers, [
      "instrumentid",
      "isin",
      "securityid",
      "providerinstrumentid",
      "instrumentkey",
    ]);
    const displaySymbol = valueAt(values, headers, ["symbol", "ticker", "tradingsymbol", "scrip", "security"]);
    const needsResolution = Boolean(kind && ["buy", "sell", "opening-balance"].includes(kind) && !explicitInstrumentId);

    if (needsResolution) {
      rowIssues.push({
        code: "INSTRUMENT_RESOLUTION_REQUIRED",
        rowNumber,
        field: "instrumentId",
        message: displaySymbol
          ? `Symbol "${displaySymbol}" has no stable instrument identity; resolve it before calculations.`
          : "No stable instrument identity was found; resolve the instrument before calculations.",
      });
    }

    const transactionId = valueAt(values, headers, ["transactionid", "tradeid", "executionid"]);
    const date = valueAt(values, headers, ["occurredat", "datetime", "timestamp", "date", "tradedate", "transactiondate"]);
    const currency = valueAt(values, headers, ["currency", "curr"]);
    const quantity = parseNumber(valueAt(values, headers, ["quantity", "qty", "shares", "units"]));
    const unitPrice = parseNumber(valueAt(values, headers, ["unitprice", "price", "rate", "tradeprice", "averageprice"]));
    const amountValue = valueAt(values, headers, ["amount", "netamount", "feeamount", "dividendamount"]);
    const feeAmount = valueAt(values, headers, ["charges", "fees", "brokerage"]);
    const amount = parseNumber(amountValue ?? (kind === "fee" ? feeAmount : undefined));
    const charges = parseNumber(feeAmount);

    const candidate: Record<string, unknown> = {
      transactionId: transactionId || deterministicId(fileName, rowNumber, raw),
      kind,
      instrumentId: explicitInstrumentId || undefined,
      occurredAt: date,
      currency,
      source: { fileName, rowNumber },
    };

    if (quantity !== undefined) candidate.quantity = quantity;
    if (unitPrice !== undefined) candidate.unitPrice = unitPrice;
    if (amount !== undefined) candidate.amount = amount;
    if (charges !== undefined && kind !== "fee") candidate.charges = charges;

    const validation = validateTransaction(candidate);
    if (validation.status === "invalid") {
      for (const issue of validation.issues) {
        rowIssues.push({
          code: "INVALID_TRANSACTION_FIELD",
          rowNumber,
          field: issue.field,
          message: issue.message,
        });
      }
    }

    if (rowIssues.length > 0) {
      const status = needsResolution ? "needs-resolution" : "invalid";
      rows.push({ rowNumber, raw, status, issues: rowIssues });
      return;
    }

    if (validation.status === "valid") {
      transactions.push(validation.transaction);
      rows.push({ rowNumber, raw, status: "valid", transaction: validation.transaction, issues: [] });
    }
  });

  const issues = [...globalIssues, ...rows.flatMap((row) => row.issues)];
  const acceptedCount = transactions.length;
  const rejectedCount = rows.length - acceptedCount;

  return {
    fileName,
    headers,
    rows,
    transactions,
    issues,
    rowCount: dataRecords.length,
    acceptedCount,
    rejectedCount,
    isComplete: issues.length === 0 && parsed.errors.length === 0,
  };
}

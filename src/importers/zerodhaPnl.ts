import Papa from "papaparse";
import type { XlsxSheet } from "./xlsx";

/**
 * Reads Zerodha Console's "P&L statement" (Reports → P&L → Equity), .xlsx or .csv.
 * It holds Zerodha's own figures per stock for a date range: realized P&L, and the open
 * quantity / open value (cost) at the end of the range — used to verify Smartfolio's
 * calculations, never as transactions.
 */
export interface PnlStatementRow {
  symbol: string;
  isin: string;
  /** Quantity traded (sold) in the period, as Zerodha reports it. */
  quantity: number | null;
  buyValue: number | null;
  sellValue: number | null;
  realized: number | null;
  previousClose: number | null;
  openQuantity: number | null;
  /** Zerodha's cost of the open quantity. */
  openValue: number | null;
  unrealized: number | null;
}

export interface PnlStatement {
  fileName: string;
  /** Period covered (YYYY-MM-DD), from the statement's title. */
  from: string | null;
  to: string | null;
  charges: number | null;
  rows: PnlStatementRow[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]/g, "");
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const cleaned = value.replace(/[,₹\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

const COLUMNS: Record<keyof Omit<PnlStatementRow, "symbol" | "isin">, string[]> = {
  quantity: ["quantity"],
  buyValue: ["buyvalue"],
  sellValue: ["sellvalue"],
  realized: ["realizedpl", "realisedpl", "realizedprofitloss"],
  previousClose: ["previousclosingprice", "previousclose"],
  openQuantity: ["openquantity"],
  openValue: ["openvalue"],
  unrealized: ["unrealizedpl", "unrealisedpl"],
};

/** Finds the statement table in already-read rows (from .xlsx sheets or a .csv). */
export function parseZerodhaPnlRows(rows: string[][], fileName: string): PnlStatement | null {
  const headerIndex = rows.findIndex((row) => {
    const cells = row.map(normalize);
    return cells.includes("symbol") && cells.includes("isin") && cells.some((cell) => COLUMNS.realized.includes(cell));
  });
  if (headerIndex < 0) return null;
  const header = rows[headerIndex]!.map(normalize);
  const col = (aliases: string[]) => header.findIndex((cell) => aliases.includes(cell));
  const symbolCol = col(["symbol"]);
  const isinCol = col(["isin"]);
  const indexes = Object.fromEntries(Object.entries(COLUMNS).map(([key, aliases]) => [key, col(aliases)])) as Record<keyof typeof COLUMNS, number>;

  let from: string | null = null;
  let to: string | null = null;
  let charges: number | null = null;
  for (const row of rows.slice(0, headerIndex)) {
    const text = row.join(" ");
    const period = text.match(/from\s+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
    if (period && !from) {
      from = period[1]!;
      to = period[2]!;
    }
    const cells = row.filter((cell) => cell.trim() !== "");
    if (charges === null && cells.length >= 2 && normalize(cells[0]!) === "charges") charges = toNumber(cells[1]);
  }

  const result: PnlStatementRow[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const isin = (row[isinCol] ?? "").trim().toUpperCase();
    const symbol = (row[symbolCol] ?? "").trim().toUpperCase();
    if (!/^IN[A-Z0-9]{9}[0-9]$/.test(isin)) continue;
    const value = (key: keyof typeof COLUMNS) => (indexes[key] >= 0 ? toNumber(row[indexes[key]]) : null);
    result.push({
      symbol,
      isin,
      quantity: value("quantity"),
      buyValue: value("buyValue"),
      sellValue: value("sellValue"),
      realized: value("realized"),
      previousClose: value("previousClose"),
      openQuantity: value("openQuantity"),
      openValue: value("openValue"),
      unrealized: value("unrealized"),
    });
  }
  return result.length > 0 ? { fileName, from, to, charges, rows: result } : null;
}

export function parseZerodhaPnlSheets(sheets: XlsxSheet[], fileName: string): PnlStatement | null {
  for (const sheet of sheets) {
    const statement = parseZerodhaPnlRows(sheet.rows, fileName);
    if (statement) return statement;
  }
  return null;
}

export function parseZerodhaPnlCsv(text: string, fileName: string): PnlStatement | null {
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy" });
  return parseZerodhaPnlRows(parsed.data.map((row) => row.map((cell) => String(cell ?? ""))), fileName);
}

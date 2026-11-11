import Papa from "papaparse";
import { parseGenericCsv, type GenericCsvImportResult } from "./genericCsv";

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Detects the known Zerodha Tradebook shape before applying its documented
 * day-month-year date convention. Unrecognized files are left to the generic parser.
 */
export function parseZerodhaTradebook(
  text: string,
  fileName: string,
): GenericCsvImportResult | null {
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    dynamicTyping: false,
    delimiter: "",
    skipEmptyLines: "greedy",
  });
  const rows = parsed.data;
  const headers = (rows[0] ?? []).map((header) => normalizeHeader(String(header ?? "")));
  const has = (...aliases: string[]) => aliases.some((alias) => headers.includes(normalizeHeader(alias)));
  const isTradebook =
    has("trade_date", "trade date", "tradedate") &&
    has("trade_id", "trade id", "tradeid") &&
    has("trade_type", "trade type", "tradetype") &&
    has("exchange") &&
    has("quantity", "qty") &&
    has("price", "trade_price", "trade price");
  if (!isTradebook) return null;

  const dateIndex = headers.findIndex((header) =>
    ["tradedate", "date"].includes(header),
  );
  if (dateIndex < 0) return null;
  const executionIndex = headers.findIndex((header) => header === "orderexecutiontime");

  const normalizedRows = rows.map((row, rowIndex) => {
    if (rowIndex === 0) return row;
    const next = [...row];
    const rawDate = String(next[dateIndex] ?? "").trim();
    const match = rawDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (match) {
      const [, day, month, year] = match;
      const candidate = `${year}-${month}-${day}`;
      const date = new Date(candidate + "T00:00:00Z");
      if (
        date.getUTCFullYear() === Number(year) &&
        date.getUTCMonth() + 1 === Number(month) &&
        date.getUTCDate() === Number(day)
      ) {
        next[dateIndex] = candidate;
      }
    }
    // Zerodha's execution time is exchange local time (IST, no offset in the
    // file). Using it gives same-day trades a reliable order; it is only used
    // when it falls on the trade date, otherwise the date-only value stays.
    if (executionIndex >= 0) {
      const execution = String(next[executionIndex] ?? "").trim().replace(" ", "T");
      const tradeDate = String(next[dateIndex] ?? "").trim();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(execution) && execution.slice(0, 10) === tradeDate) {
        next[dateIndex] = execution + "+05:30";
      }
    }
    return next;
  });

  return parseGenericCsv(
    Papa.unparse(normalizedRows, { delimiter: parsed.meta.delimiter || "," }),
    fileName,
  );
}

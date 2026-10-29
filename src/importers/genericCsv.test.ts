import { describe, expect, it } from "vitest";
import { parseGenericCsv } from "./genericCsv";

describe("parseGenericCsv", () => {
  it("normalizes valid trades and preserves source row metadata", () => {
    const result = parseGenericCsv(
      "transactionId,kind,ISIN,date,currency,quantity,price\nT-1,buy,INE002A01018,2026-10-01,INR,10,125.5",
      "trades.csv",
    );
    expect(result.rowCount).toBe(1);
    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.transactions[0].instrumentId).toBe("INE002A01018");
    expect(result.transactions[0].source.rowNumber).toBe(2);
  });

  it("preserves symbol-only rows as needs-resolution instead of guessing identity", () => {
    const result = parseGenericCsv(
      "type,symbol,date,currency,qty,price\nBUY,RELIANCE,2026-10-01,INR,10,125",
      "trades.csv",
    );
    expect(result.rows[0].status).toBe("needs-resolution");
    expect(result.transactions).toHaveLength(0);
    expect(result.issues.some((issue) => issue.code === "INSTRUMENT_RESOLUTION_REQUIRED")).toBe(true);
  });

  it("preserves malformed rows and reports validation issues", () => {
    const result = parseGenericCsv(
      "transactionId,kind,ISIN,date,currency,quantity,price\nT-1,buy,INE002A01018,2026-10-01,INR,not-a-number,125\nT-2,sell,INE002A01018,2026-10-02,INR,1,",
      "trades.csv",
    );
    expect(result.rowCount).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rejectedCount).toBe(2);
    expect(result.issues.some((issue) => issue.field === "quantity")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "unitPrice")).toBe(true);
  });

  it("supports quoted commas and embedded line breaks", () => {
    const result = parseGenericCsv(
      'transactionId,kind,ISIN,date,currency,quantity,price,note\nT-1,buy,INE002A01018,2026-10-01,INR,"1,000","125.50","first line,\nsecond line"',
      "trades.csv",
    );
    expect(result.rowCount).toBe(1);
    expect(result.transactions[0].quantity).toBe(1000);
    expect(result.transactions[0].unitPrice).toBe(125.5);
    expect(result.rows[0].raw.note).toContain("second line");
  });

  it("reports duplicate normalized headers instead of silently choosing a column", () => {
    const result = parseGenericCsv(
      "kind,ISIN,isin,date,currency,quantity,price\nbuy,INE002A01018,INE002A01018,2026-10-01,INR,1,10",
      "trades.csv",
    );
    expect(result.acceptedCount).toBe(0);
    expect(result.rows[0].status).toBe("invalid");
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_HEADERS")).toBe(true);
  });

  it("rejects malformed thousands separators instead of stripping arbitrary commas", () => {
    const result = parseGenericCsv(
      'kind,ISIN,date,currency,quantity,price\\nbuy,INE002A01018,2026-10-01,INR,"1,2,3",10',
      "trades.csv",
    );
    expect(result.rows[0].status).toBe("invalid");
    expect(result.transactions).toHaveLength(0);
    expect(result.issues.some((issue) => issue.field === "quantity")).toBe(true);
  });

  it("reports unsupported transaction kinds without dropping the row", () => {
    const result = parseGenericCsv(
      "kind,ISIN,date,currency,quantity,price\nSPLIT,INE002A01018,2026-10-01,INR,1,10",
      "trades.csv",
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].status).toBe("invalid");
    expect(result.issues.some((issue) => issue.code === "UNSUPPORTED_TRANSACTION_KIND")).toBe(true);
  });
});

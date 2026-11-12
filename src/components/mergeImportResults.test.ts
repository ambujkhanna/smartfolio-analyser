import { describe, expect, it } from "vitest";
import { mergeImportResults } from "./ImportReview";
import { parseZerodhaTradebook } from "../importers/zerodhaTradebook";
import { buildLedger } from "../engine/buildLedger";

const HEADER = "symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time";
const fileA = [HEADER, "WIPRO,INE075A01022,2025-01-10,NSE,EQ,EQ,buy,false,10,250,1001,9001,2025-01-10T10:00:00"].join("\n");
const fileB = [
  HEADER,
  "WIPRO,INE075A01022,2025-01-10,NSE,EQ,EQ,buy,false,10,250,1001,9001,2025-01-10T10:00:00",
  "WIPRO,INE075A01022,2026-02-10,NSE,EQ,EQ,sell,false,4,300,2002,9002,2026-02-10T10:00:00",
].join("\n");

describe("mergeImportResults", () => {
  it("combines yearly files and counts an overlapping trade once", () => {
    const a = parseZerodhaTradebook(fileA, "2025.csv");
    const b = parseZerodhaTradebook(fileB, "2026.csv");
    expect(a && b).toBeTruthy();
    const merged = mergeImportResults([a!, b!]);
    expect(merged.transactions).toHaveLength(3);
    expect(new Set(merged.rows.map((row) => row.rowNumber)).size).toBe(merged.rows.length);
    const ledger = buildLedger(merged.transactions);
    expect(ledger.errors).toHaveLength(0);
    expect(ledger.instruments[0]!.openQuantity).toBe(6);
    expect(ledger.instruments[0]!.realizedPnl).toBeCloseTo(200);
  });
});

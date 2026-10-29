import { describe, expect, it } from "vitest";
import { parseZerodhaTradebook } from "./zerodhaTradebook";

describe("parseZerodhaTradebook", () => {
  it("recognizes the tradebook schema and normalizes DD-MM-YYYY dates", () => {
    const csv = [
      "symbol,isin,trade_date,exchange,segment,series,trade_type,quantity,price,trade_id",
      "OFSS,INE881D01027,01-04-2025,NSE,EQ,EQ,buy,1,7689.6,402735415",
    ].join("\n");

    const result = parseZerodhaTradebook(csv, "tradebook.csv");
    expect(result).not.toBeNull();
    expect(result?.acceptedCount).toBe(1);
    expect(result?.transactions[0].occurredAt).toBe("2025-04-01");
    expect(result?.transactions[0].transactionId).toBe("402735415");
    expect(result?.transactions[0].currency).toBe("INR");
  });

  it("does not claim unrelated CSV files as Zerodha tradebooks", () => {
    expect(
      parseZerodhaTradebook("kind,isin,date,quantity,price\nbuy,INE002A01018,2025-04-01,1,10", "trades.csv"),
    ).toBeNull();
  });

  it("does not silently repair impossible broker dates", () => {
    const result = parseZerodhaTradebook(
      "symbol,isin,trade_date,exchange,segment,series,trade_type,quantity,price,trade_id\nOFSS,INE881D01027,31-02-2025,NSE,EQ,EQ,buy,1,7689.6,402735415",
      "tradebook.csv",
    );
    expect(result?.acceptedCount).toBe(0);
    expect(result?.issues.some((issue) => issue.field === "occurredAt")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { validateTransaction, type CanonicalTransaction } from "./transaction";

function transaction(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    transactionId: "broker-row-2",
    kind: "buy",
    instrumentId: "NSE:INE002A01018",
    occurredAt: "2026-10-28T10:15:00.000Z",
    currency: "INR",
    quantity: 10,
    unitPrice: 125,
    source: { fileName: "sanitized-trades.csv", rowNumber: 2 },
    ...overrides,
  };
}

describe("validateTransaction", () => {
  it("accepts a valid buy and preserves source row metadata", () => {
    const result = validateTransaction(transaction());
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.transaction.quantity).toBe(10);
      expect(result.transaction.source).toEqual({ fileName: "sanitized-trades.csv", rowNumber: 2 });
    }
  });

  it("rejects non-object input without throwing", () => {
    expect(validateTransaction(null).status).toBe("invalid");
    expect(validateTransaction("buy").status).toBe("invalid");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid trade quantity %s",
    (quantity) => {
      const result = validateTransaction(transaction({ quantity }));
      expect(result.status).toBe("invalid");
    },
  );

  it("does not require unknown opening cost basis, but validates it if supplied", () => {
    const opening = transaction({ kind: "opening-balance", unitPrice: undefined });
    expect(validateTransaction(opening).status).toBe("valid");
    expect(validateTransaction({ ...opening, unitPrice: 0 }).status).toBe("invalid");
  });

  it("requires a price for buys and sells", () => {
    expect(validateTransaction(transaction({ unitPrice: undefined })).status).toBe("invalid");
    expect(validateTransaction(transaction({ kind: "sell", unitPrice: undefined })).status).toBe("invalid");
  });

  it("requires amount for fee and dividend rows", () => {
    const fee = {
      transactionId: "fee-1",
      kind: "fee",
      occurredAt: "2026-10-28",
      currency: "INR",
      amount: 15,
      source: { fileName: "ledger.csv", rowNumber: 4 },
    };
    expect(validateTransaction(fee).status).toBe("valid");
    expect(validateTransaction({ ...fee, amount: 0 }).status).toBe("invalid");
  });

  it("rejects ambiguous locale dates and impossible calendar dates", () => {
    expect(validateTransaction(transaction({ occurredAt: "01-10-2026" })).status).toBe("invalid");
    expect(validateTransaction(transaction({ occurredAt: "2026-02-31" })).status).toBe("invalid");
  });

  it("reports missing source metadata and malformed dates", () => {
    const result = validateTransaction(transaction({
      occurredAt: "not-a-date",
      source: { fileName: "", rowNumber: 0 },
    }));
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.issues.map((issue) => issue.field)).toContain("occurredAt");
      expect(result.issues.map((issue) => issue.field)).toContain("source.fileName");
      expect(result.issues.map((issue) => issue.field)).toContain("source.rowNumber");
    }
  });
});

import { describe, expect, it } from "vitest";
import { buildLedger } from "./buildLedger";
import type { CanonicalTransaction } from "../domain/transaction";

function trade(overrides: Partial<CanonicalTransaction>): CanonicalTransaction {
  return {
    transactionId: "trade-1",
    kind: "buy",
    instrumentId: "NSE:INE002A01018",
    occurredAt: "2026-10-01T10:00:00.000Z",
    currency: "INR",
    quantity: 1,
    unitPrice: 100,
    source: { fileName: "trades.csv", rowNumber: 2 },
    ...overrides,
  };
}

function instrument(result: ReturnType<typeof buildLedger>) {
  return result.instruments.find((item) => item.instrumentId === "NSE:INE002A01018");
}

describe("buildLedger", () => {
  it("allocates a partial sale using FIFO lots", () => {
    const result = buildLedger([
      trade({ transactionId: "buy-a", quantity: 5, unitPrice: 100, source: { fileName: "trades.csv", rowNumber: 2 } }),
      trade({ transactionId: "buy-b", quantity: 5, unitPrice: 120, source: { fileName: "trades.csv", rowNumber: 3 }, occurredAt: "2026-10-02T10:00:00.000Z" }),
      trade({ transactionId: "sell-a", kind: "sell", quantity: 6, unitPrice: 130, source: { fileName: "trades.csv", rowNumber: 4 }, occurredAt: "2026-10-03T10:00:00.000Z" }),
    ]);
    const position = instrument(result);
    expect(position?.realizedPnl).toBe(160);
    expect(position?.openQuantity).toBe(4);
    expect(position?.openCostBasisTotal).toBe(480);
    expect(result.errors).toHaveLength(0);
  });

  it("preserves lifecycle history through sell and re-buy", () => {
    const result = buildLedger([
      trade({ transactionId: "buy-1", quantity: 10, unitPrice: 100 }),
      trade({ transactionId: "sell-1", kind: "sell", quantity: 10, unitPrice: 60, occurredAt: "2026-10-02T10:00:00.000Z" }),
      trade({ transactionId: "buy-2", quantity: 10, unitPrice: 65, occurredAt: "2026-10-03T10:00:00.000Z" }),
    ]);
    const position = instrument(result);
    expect(position?.realizedPnl).toBe(-400);
    expect(position?.openQuantity).toBe(10);
    expect(position?.openCostBasisTotal).toBe(650);
  });

  it("rejects an oversell without creating a negative holding", () => {
    const result = buildLedger([
      trade({ transactionId: "buy-1", quantity: 2 }),
      trade({ transactionId: "sell-1", kind: "sell", quantity: 3, unitPrice: 120, occurredAt: "2026-10-02T10:00:00.000Z" }),
    ]);
    expect(instrument(result)?.openQuantity).toBe(2);
    expect(result.errors.some((issue) => issue.code === "OVERSELL")).toBe(true);
    expect(result.rejectedTransactionCount).toBe(1);
  });

  it("keeps realized P&L unavailable when sold opening units had unknown cost", () => {
    const opening = trade({
      transactionId: "opening-1",
      kind: "opening-balance",
      quantity: 5,
      unitPrice: undefined,
    });
    const sale = trade({
      transactionId: "sell-1",
      kind: "sell",
      quantity: 2,
      unitPrice: 120,
      occurredAt: "2026-10-02T10:00:00.000Z",
    });
    const result = buildLedger([opening, sale]);
    expect(instrument(result)?.realizedPnl).toBeNull();
    expect(instrument(result)?.openQuantity).toBe(3);
    expect(instrument(result)?.openCostBasisTotal).toBeNull();
    expect(result.warnings.some((issue) => issue.code === "UNKNOWN_SOLD_COST_BASIS")).toBe(true);
  });

  it("includes trade charges once in FIFO cost and net proceeds", () => {
    const result = buildLedger([
      trade({ transactionId: "buy-1", quantity: 5, unitPrice: 100, charges: 10 }),
      trade({ transactionId: "sell-1", kind: "sell", quantity: 5, unitPrice: 120, charges: 5, occurredAt: "2026-10-02T10:00:00.000Z" }),
    ]);
    expect(instrument(result)?.realizedPnl).toBe(85);
    expect(result.cashFlows.buyOutflows).toBe(510);
    expect(result.cashFlows.netSaleProceeds).toBe(595);
  });

  it("rejects duplicate transaction IDs with conflicting details instead of double counting", () => {
    const first = trade({ transactionId: "same-id", quantity: 2 });
    const second = trade({ transactionId: "same-id", quantity: 2, unitPrice: 101, source: { fileName: "copy.csv", rowNumber: 2 } });
    const result = buildLedger([first, second]);
    expect(result.instruments).toHaveLength(0);
    expect(result.errors.some((issue) => issue.code === "DUPLICATE_TRANSACTION_ID")).toBe(true);
    expect(result.rejectedTransactionCount).toBe(2);
  });

  it("applies a 1:5 stock split by multiplying quantity and keeping total cost", () => {
    // Buy 10 @ ₹500 = ₹5,000; 1:5 split → 50 units, cost still ₹5,000 (₹100/unit).
    // Sell 20 @ ₹120 = ₹2,400 proceeds, FIFO cost 20 × ₹100 = ₹2,000 → realized ₹400.
    const result = buildLedger([
      trade({ transactionId: "buy", quantity: 10, unitPrice: 500 }),
      trade({ transactionId: "split", kind: "split", quantity: undefined, unitPrice: undefined, ratio: 5, occurredAt: "2026-10-05T00:00:00.000Z", source: { fileName: "actions.csv", rowNumber: 2 } }),
      trade({ transactionId: "sell", kind: "sell", quantity: 20, unitPrice: 120, occurredAt: "2026-10-06T10:00:00.000Z", source: { fileName: "trades.csv", rowNumber: 3 } }),
    ]);
    const position = instrument(result);
    expect(position?.openQuantity).toBeCloseTo(30);
    expect(position?.openCostBasisTotal).toBeCloseTo(3000);
    expect(position?.realizedPnl).toBeCloseTo(400);
    expect(result.cashFlows.buyOutflows).toBe(5000);
  });

  it("applies a 1:1 bonus without creating cash flows", () => {
    const result = buildLedger([
      trade({ transactionId: "buy", quantity: 4, unitPrice: 300 }),
      trade({ transactionId: "bonus", kind: "bonus", quantity: undefined, unitPrice: undefined, ratio: 2, occurredAt: "2026-10-05T00:00:00.000Z", source: { fileName: "actions.csv", rowNumber: 2 } }),
    ]);
    const position = instrument(result);
    expect(position?.openQuantity).toBe(8);
    expect(position?.openCostBasisTotal).toBe(1200);
    expect(result.cashFlows.netSaleProceeds).toBe(0);
    expect(result.isComplete).toBe(true);
  });

  it("warns instead of guessing when a corporate action has no open position", () => {
    const result = buildLedger([
      trade({ transactionId: "split", kind: "split", quantity: undefined, unitPrice: undefined, ratio: 2 }),
    ]);
    expect(result.warnings.some((issue) => issue.code === "CORPORATE_ACTION_WITHOUT_POSITION")).toBe(true);
    expect(instrument(result)?.openQuantity ?? 0).toBe(0);
  });

  it("rejects a split without a valid ratio", () => {
    const result = buildLedger([
      trade({ transactionId: "split", kind: "split", quantity: undefined, unitPrice: undefined }),
      trade({ transactionId: "split-1", kind: "split", quantity: undefined, unitPrice: undefined, ratio: 1 }),
    ]);
    expect(result.rejectedTransactionCount).toBe(2);
    expect(result.errors.every((issue) => issue.code === "INVALID_TRANSACTION")).toBe(true);
  });

  it("counts an identical re-imported transaction once", () => {
    const original = trade({ transactionId: "NSE:2026-10-01:402735415", quantity: 3 });
    const reimported = trade({ transactionId: "NSE:2026-10-01:402735415", quantity: 3, source: { fileName: "tradebook-copy.csv", rowNumber: 7 } });
    const result = buildLedger([original, reimported]);
    expect(instrument(result)?.openQuantity).toBe(3);
    expect(result.rejectedTransactionCount).toBe(0);
    expect(result.errors.some((issue) => issue.code === "DUPLICATE_TRANSACTION_ID")).toBe(false);
    const merged = result.warnings.find((issue) => issue.code === "DUPLICATE_TRANSACTION_MERGED");
    expect(merged?.message).toContain("tradebook-copy.csv row 7");
  });

  it("gives the same ledger when the same file is imported twice", () => {
    const rows = [
      trade({ transactionId: "b1", quantity: 5, unitPrice: 100 }),
      trade({ transactionId: "s1", kind: "sell", quantity: 2, unitPrice: 130, occurredAt: "2026-10-03T10:00:00.000Z", source: { fileName: "trades.csv", rowNumber: 3 } }),
    ];
    const once = buildLedger(rows);
    const twice = buildLedger([...rows, ...rows.map((row) => ({ ...row, source: { fileName: "again.csv", rowNumber: row.source.rowNumber } }))]);
    expect(instrument(twice)?.openQuantity).toBe(instrument(once)?.openQuantity);
    expect(instrument(twice)?.realizedPnl).toBe(instrument(once)?.realizedPnl);
    expect(twice.isComplete).toBe(once.isComplete);
  });

  it("flags date-only same-day ordering as ambiguous", () => {
    const result = buildLedger([
      trade({ transactionId: "buy-1", occurredAt: "2026-10-01", quantity: 2 }),
      trade({ transactionId: "sell-1", kind: "sell", occurredAt: "2026-10-01", quantity: 1, unitPrice: 120, source: { fileName: "trades.csv", rowNumber: 3 } }),
    ]);
    expect(result.warnings.some((issue) => issue.code === "AMBIGUOUS_ORDER")).toBe(true);
    expect(instrument(result)?.realizedPnl).toBeNull();
  });
});

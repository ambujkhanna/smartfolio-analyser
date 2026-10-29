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

  it("rejects duplicate transaction IDs instead of double counting", () => {
    const first = trade({ transactionId: "same-id", quantity: 2 });
    const second = trade({ transactionId: "same-id", quantity: 2, source: { fileName: "copy.csv", rowNumber: 2 } });
    const result = buildLedger([first, second]);
    expect(result.instruments).toHaveLength(0);
    expect(result.errors.some((issue) => issue.code === "DUPLICATE_TRANSACTION_ID")).toBe(true);
    expect(result.rejectedTransactionCount).toBe(2);
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

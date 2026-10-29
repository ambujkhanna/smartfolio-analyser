import { describe, expect, it } from "vitest";
import { validateQuote, type MarketQuote } from "../domain/quote";
import type { CanonicalTransaction } from "../domain/transaction";
import { buildLedger } from "./buildLedger";
import { calculatePortfolioPnL } from "./calculatePortfolioPnL";
import { valueOpenPosition } from "./valuePosition";

const instrumentId = "NSE:INE002A01018";
const nowMs = Date.parse("2026-10-29T10:00:00.000Z");

function trade(overrides: Partial<CanonicalTransaction>): CanonicalTransaction {
  return {
    transactionId: "trade-1",
    kind: "buy",
    instrumentId,
    occurredAt: "2026-10-01T10:00:00.000Z",
    currency: "INR",
    quantity: 1,
    unitPrice: 100,
    source: { fileName: "trades.csv", rowNumber: 2 },
    ...overrides,
  };
}

function currentQuote(price: number) {
  const quote: MarketQuote = {
    instrumentId,
    price,
    currency: "INR",
    source: "test-fixture",
    quoteType: "delayed",
    observedAt: "2026-10-29T09:59:00.000Z",
  };
  return validateQuote(quote, instrumentId, {
    nowMs,
    maxAgeMs: 5 * 60 * 1000,
    expectedCurrency: "INR",
  });
}

function calculate(transactions: CanonicalTransaction[], price: number | null) {
  const ledger = buildLedger(transactions);
  const position = ledger.instruments.find((item) => item.instrumentId === instrumentId);
  const valuations = position && position.openQuantity > 0 && price !== null
    ? {
        [instrumentId]: valueOpenPosition(
          {
            instrumentId,
            quantity: position.openQuantity,
            costBasisTotal: position.openCostBasisTotal,
          },
          currentQuote(price),
        ),
      }
    : {};
  return calculatePortfolioPnL(ledger, valuations);
}

describe("calculatePortfolioPnL", () => {
  it("reconciles sell-at-loss then re-buy lifecycle example", () => {
    const result = calculate([
      trade({ transactionId: "buy-1", quantity: 10, unitPrice: 100 }),
      trade({ transactionId: "sell-1", kind: "sell", quantity: 10, unitPrice: 60, occurredAt: "2026-10-02T10:00:00.000Z" }),
      trade({ transactionId: "buy-2", quantity: 10, unitPrice: 65, occurredAt: "2026-10-03T10:00:00.000Z" }),
    ], 75);

    expect(result.realizedPnl).toBe(-400);
    expect(result.unrealizedPnl).toBe(100);
    expect(result.marketValue).toBe(750);
    expect(result.economicPnl).toBe(-300);
    expect(result.instrumentMetrics[0].positionBreakEvenPrice).toBe(65);
    expect(result.instrumentMetrics[0].lifecycleRecoveryPrice).toBe(105);
    expect(result.isComplete).toBe(true);
  });

  it("reconciles FIFO partial-sale example", () => {
    const result = calculate([
      trade({ transactionId: "buy-a", quantity: 5, unitPrice: 100 }),
      trade({ transactionId: "buy-b", quantity: 5, unitPrice: 120, occurredAt: "2026-10-02T10:00:00.000Z", source: { fileName: "trades.csv", rowNumber: 3 } }),
      trade({ transactionId: "sell-a", kind: "sell", quantity: 6, unitPrice: 130, occurredAt: "2026-10-03T10:00:00.000Z", source: { fileName: "trades.csv", rowNumber: 4 } }),
    ], 125);
    expect(result.realizedPnl).toBe(160);
    expect(result.unrealizedPnl).toBe(20);
    expect(result.economicPnl).toBe(180);
  });

  it("keeps economic P&L unavailable when a required current quote is missing", () => {
    const result = calculate([
      trade({ transactionId: "buy-1", quantity: 2, unitPrice: 100 }),
    ], null);
    expect(result.realizedPnl).toBe(0);
    expect(result.marketValue).toBeNull();
    expect(result.unrealizedPnl).toBeNull();
    expect(result.economicPnl).toBeNull();
    expect(result.isComplete).toBe(false);
  });

  it("keeps P&L and recovery unavailable for an opening balance with unknown cost", () => {
    const result = calculate([
      trade({ transactionId: "opening-1", kind: "opening-balance", quantity: 2, unitPrice: undefined }),
    ], 125);
    expect(result.marketValue).toBe(250);
    expect(result.unrealizedPnl).toBeNull();
    expect(result.economicPnl).toBeNull();
    expect(result.instrumentMetrics[0].positionBreakEvenPrice).toBeNull();
    expect(result.instrumentMetrics[0].lifecycleRecoveryPrice).toBeNull();
  });
});

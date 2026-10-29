import { describe, expect, it } from "vitest";
import { validateQuote, type MarketQuote } from "../domain/quote";
import { valueOpenPosition } from "./valuePosition";

const nowMs = Date.parse("2026-10-29T10:00:00.000Z");
const instrumentId = "NSE:INE002A01018";
const position = { instrumentId, quantity: 10, costBasisTotal: 1_000 };

function quote(overrides: Partial<MarketQuote> = {}): MarketQuote {
  return {
    instrumentId,
    price: 125,
    currency: "INR",
    source: "test-fixture",
    quoteType: "delayed",
    observedAt: "2026-10-29T09:59:00.000Z",
    ...overrides,
  };
}

function validQuote() {
  return validateQuote(quote(), instrumentId, {
    nowMs,
    maxAgeMs: 5 * 60 * 1000,
    expectedCurrency: "INR",
  });
}

describe("valueOpenPosition", () => {
  it("calculates market value and unrealized P&L from an explicit validated quote", () => {
    const result = valueOpenPosition(position, validQuote());
    expect(result.status).toBe("valued");
    if (result.status === "valued") {
      expect(result.marketValue).toBe(1_250);
      expect(result.unrealizedPnl).toBe(250);
      expect(result.quoteSource).toBe("test-fixture");
      expect(result.quoteObservedAt).toBe("2026-10-29T09:59:00.000Z");
    }
  });

  it("does not calculate market value or P&L when quote is unavailable", () => {
    const result = valueOpenPosition(position, {
      status: "unavailable",
      reason: "No quote was provided.",
    });
    expect(result.status).toBe("unavailable");
    expect(result.marketValue).toBeNull();
    expect(result.unrealizedPnl).toBeNull();
  });

  it("does not treat a stale quote as current", () => {
    const stale = validateQuote(
      quote({ observedAt: "2026-10-29T09:00:00.000Z" }),
      instrumentId,
      { nowMs, maxAgeMs: 5 * 60 * 1000, expectedCurrency: "INR" },
    );
    const result = valueOpenPosition(position, stale);
    expect(result.status).toBe("unavailable");
    expect(result.marketValue).toBeNull();
    expect(result.unrealizedPnl).toBeNull();
  });

  it("can show a validated market value while keeping P&L unavailable without cost basis", () => {
    const result = valueOpenPosition({ instrumentId, quantity: 10 }, validQuote());
    expect(result.status).toBe("partial");
    if (result.status === "partial") {
      expect(result.marketValue).toBe(1_250);
      expect(result.costBasisTotal).toBeNull();
      expect(result.unrealizedPnl).toBeNull();
    }
  });

  it("rejects invalid quantity or cost basis", () => {
    expect(valueOpenPosition({ ...position, quantity: 0 }, validQuote()).status).toBe("unavailable");
    expect(valueOpenPosition({ ...position, costBasisTotal: -1 }, validQuote()).status).toBe("unavailable");
  });
});

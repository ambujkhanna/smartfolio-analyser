import { describe, expect, it } from "vitest";
import { validateQuote, type MarketQuote } from "./quote";

const nowMs = Date.parse("2026-10-29T10:00:00.000Z");

function quote(overrides: Partial<MarketQuote> = {}): MarketQuote {
  return {
    instrumentId: "NSE:INE002A01018",
    price: 125.5,
    currency: "INR",
    source: "test-fixture",
    quoteType: "delayed",
    observedAt: "2026-10-29T09:59:00.000Z",
    ...overrides,
  };
}

const options = { nowMs, maxAgeMs: 5 * 60 * 1000, expectedCurrency: "INR" };

describe("validateQuote", () => {
  it("accepts a fresh quote for the expected instrument", () => {
    const result = validateQuote(quote(), "NSE:INE002A01018", options);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.quote.price).toBe(125.5);
      expect(result.ageMs).toBe(60_000);
    }
  });

  it("does not invent a quote when data is missing", () => {
    expect(validateQuote(null, "NSE:INE002A01018", options)).toEqual({
      status: "unavailable",
      reason: "No quote was provided.",
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid price %s",
    (price) => {
      expect(validateQuote(quote({ price }), "NSE:INE002A01018", options).status).toBe("invalid");
    },
  );

  it("rejects a quote for a different instrument", () => {
    expect(validateQuote(quote(), "BSE:INE002A01018", options).status).toBe("mismatched");
  });

  it("rejects a currency mismatch", () => {
    expect(validateQuote(quote({ currency: "USD" }), "NSE:INE002A01018", options).status).toBe("mismatched");
  });

  it("marks a quote stale rather than using it as current", () => {
    const result = validateQuote(
      quote({ observedAt: "2026-10-29T09:00:00.000Z" }),
      "NSE:INE002A01018",
      options,
    );
    expect(result.status).toBe("stale");
  });

  it("rejects future timestamps and invalid dates", () => {
    expect(
      validateQuote(quote({ observedAt: "2026-10-29T11:00:00.000Z" }), "NSE:INE002A01018", options).status,
    ).toBe("invalid");
    expect(
      validateQuote(quote({ observedAt: "not-a-date" }), "NSE:INE002A01018", options).status,
    ).toBe("invalid");
  });
});

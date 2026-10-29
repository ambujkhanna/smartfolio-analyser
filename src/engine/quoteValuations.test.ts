import { describe, expect, it } from "vitest";
import { parseGenericCsv } from "../importers/genericCsv";
import { buildLedger } from "./buildLedger";
import { buildPositionValuations } from "./quoteValuations";
import type { QuoteValidation } from "../domain/quote";

const now = "2026-10-29T10:00:00.000Z";

function makeLedger() {
  const imported = parseGenericCsv(
    "transactionId,kind,ISIN,date,currency,quantity,price\nT-1,buy,INE002A01018,2026-10-01,INR,10,100",
    "test.csv",
  );
  return buildLedger(imported.transactions);
}

describe("buildPositionValuations", () => {
  it("converts an available quote into a valued position", () => {
    const ledger = makeLedger();
    const quote: QuoteValidation = {
      status: "available",
      quote: {
        instrumentId: "INE002A01018",
        price: 120,
        currency: "INR",
        source: "Fixture",
        quoteType: "real-time",
        observedAt: now,
        retrievedAt: now,
      },
      ageMs: 0,
    };
    const result = buildPositionValuations(ledger, { "INE002A01018": quote });
    expect(result["INE002A01018"]).toMatchObject({
      status: "valued",
      marketValue: 1200,
      costBasisTotal: 1000,
      unrealizedPnl: 200,
    });
  });

  it("maps stale quotes to unavailable valuations and leaves missing quotes absent", () => {
    const ledger = makeLedger();
    const stale: QuoteValidation = {
      status: "stale",
      reason: "Quote is too old.",
      ageMs: 90_000_000,
    };
    const result = buildPositionValuations(ledger, { "INE002A01018": stale });
    expect(result["INE002A01018"]).toMatchObject({ status: "unavailable", marketValue: null });
    expect(buildPositionValuations(ledger, {})).toEqual({});
  });
});

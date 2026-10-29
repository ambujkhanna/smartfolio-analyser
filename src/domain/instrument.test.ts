import { describe, expect, it } from "vitest";
import { resolveInstrument, type InstrumentRecord } from "./instrument";

const master: InstrumentRecord[] = [
  {
    instrumentId: "NSE:INE002A01018",
    displayName: "Example Industries",
    assetType: "equity",
    currency: "INR",
    symbol: "EXAMPLE",
    exchange: "NSE",
    isin: "INE002A01018",
    providerInstrumentId: "NSE_EQ|INE002A01018",
  },
  {
    instrumentId: "BSE:INE002A01018",
    displayName: "Example Industries",
    assetType: "equity",
    currency: "INR",
    symbol: "EXAMPLE",
    exchange: "BSE",
    isin: "INE002A01018",
    providerInstrumentId: "BSE_EQ|INE002A01018",
  },
  {
    instrumentId: "NSE:INE999A01011",
    displayName: "Unique Company",
    assetType: "equity",
    currency: "INR",
    symbol: "UNIQUE",
    exchange: "NSE",
    isin: "INE999A01011",
    providerInstrumentId: "NSE_EQ|INE999A01011",
  },
];

describe("resolveInstrument", () => {
  it("prefers an exact canonical instrument ID", () => {
    const result = resolveInstrument({ instrumentId: "NSE:INE002A01018" }, master);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.confidence).toBe("high");
      expect(result.matchedBy).toBe("instrument-id");
    }
  });

  it("uses ISIN plus exchange for an exact exchange-specific match", () => {
    const result = resolveInstrument({ isin: "INE002A01018", exchange: "BSE" }, master);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.instrument.instrumentId).toBe("BSE:INE002A01018");
  });

  it("does not guess when an ISIN maps to multiple exchange records", () => {
    const result = resolveInstrument({ isin: "INE002A01018" }, master);
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") expect(result.candidates).toHaveLength(2);
  });

  it("can resolve a symbol only when the master proves it unique", () => {
    const result = resolveInstrument({ symbol: "unique" }, master);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.confidence).toBe("medium");
      expect(result.matchedBy).toBe("unique-symbol");
    }
  });

  it("does not guess between NSE and BSE listings with the same symbol", () => {
    const result = resolveInstrument({ symbol: "EXAMPLE" }, master);
    expect(result.status).toBe("ambiguous");
  });

  it("keeps unknown symbols unresolved", () => {
    expect(resolveInstrument({ symbol: "NOTFOUND" }, master).status).toBe("unresolved");
  });
});

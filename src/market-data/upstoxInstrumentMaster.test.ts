import { describe, expect, it, vi } from "vitest";
import {
  loadUpstoxInstrumentMaster,
  parseUpstoxInstrumentMaster,
  UPSTOX_INSTRUMENT_MASTER_URL,
} from "./upstoxInstrumentMaster";

const masterRows = [
  {
    segment: "NSE_EQ",
    name: "Example Industries",
    exchange: "NSE",
    isin: "INE002A01018",
    instrument_type: "EQ",
    instrument_key: "NSE_EQ|INE002A01018",
    trading_symbol: "EXAMPLE",
    security_type: "NORMAL",
  },
  {
    segment: "BSE_EQ",
    name: "Example Industries",
    exchange: "BSE",
    isin: "INE002A01018",
    instrument_type: "EQ",
    instrument_key: "BSE_EQ|500001",
    trading_symbol: "EXAMPLE",
    security_type: "NORMAL",
  },
  {
    segment: "NSE_EQ",
    name: "Example ETF",
    exchange: "NSE",
    isin: "INE000E01010",
    instrument_type: "EQ",
    instrument_key: "NSE_EQ|INE000E01010",
    trading_symbol: "EXETF",
    security_type: "ETF",
  },
  {
    segment: "NSE_FO",
    name: "Example Future",
    exchange: "NSE",
    instrument_type: "FUT",
    instrument_key: "NSE_FO|12345",
    trading_symbol: "EXAMPLE FUT",
  },
];

describe("parseUpstoxInstrumentMaster", () => {
  it("maps NSE/BSE equity records and keeps exchange-specific provider keys", () => {
    const result = parseUpstoxInstrumentMaster(JSON.stringify(masterRows));
    expect(result.instruments).toHaveLength(3);
    expect(result.instruments.map((item) => item.instrumentId)).toContain("NSE:NSE_EQ|INE002A01018");
    expect(result.instruments.map((item) => item.instrumentId)).toContain("BSE:BSE_EQ|500001");
    expect(result.instruments.find((item) => item.symbol === "EXETF")?.assetType).toBe("etf");
  });

  it("rejects malformed JSON and invalid equity rows", () => {
    expect(parseUpstoxInstrumentMaster("{").issues[0].code).toBe("INVALID_MASTER_JSON");
    const result = parseUpstoxInstrumentMaster(JSON.stringify([
      { segment: "NSE_EQ", instrument_type: "EQ", instrument_key: "BSE_EQ|wrong" },
    ]));
    expect(result.instruments).toHaveLength(0);
    expect(result.issues.some((issue) => issue.code === "INCOMPLETE_MASTER_ROW")).toBe(true);
  });

  it("reports duplicate provider keys", () => {
    const result = parseUpstoxInstrumentMaster(JSON.stringify([masterRows[0], masterRows[0]]));
    expect(result.instruments).toHaveLength(1);
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_PROVIDER_KEY")).toBe(true);
  });
});

describe("loadUpstoxInstrumentMaster", () => {
  it("loads JSON and records retrieval time without requiring an API token", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(UPSTOX_INSTRUMENT_MASTER_URL);
      return new Response(JSON.stringify(masterRows), { status: 200 });
    });
    const result = await loadUpstoxInstrumentMaster({
      fetcher,
      nowMs: Date.parse("2026-10-29T10:00:00.000Z"),
      useCache: false,
    });
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.result.instruments).toHaveLength(3);
      expect(result.retrievedAt).toBe("2026-10-29T10:00:00.000Z");
    }
  });

  it("returns an unavailable state for network errors", async () => {
    const fetcher = vi.fn(async () => { throw new Error("network"); });
    const result = await loadUpstoxInstrumentMaster({ fetcher, useCache: false });
    expect(result.status).toBe("unavailable");
  });
});

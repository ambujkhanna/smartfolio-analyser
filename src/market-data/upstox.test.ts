import { describe, expect, it, vi } from "vitest";
import { fetchUpstoxQuotes } from "./upstox";
import type { InstrumentRecord } from "../domain/instrument";

const nowMs = Date.parse("2026-10-29T10:00:00.000Z");

const instrument: InstrumentRecord = {
  instrumentId: "NSE:INE002A01018",
  displayName: "Example Industries",
  assetType: "equity",
  currency: "INR",
  symbol: "EXAMPLE",
  exchange: "NSE",
  isin: "INE002A01018",
  providerInstrumentId: "NSE_EQ|INE002A01018",
};

function responseFor(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      status: "success",
      data: {
        "NSE_EQ:EXAMPLE": {
          instrument_token: instrument.providerInstrumentId,
          last_price: 125.5,
          last_trade_time: String(nowMs - 60_000),
          timestamp: new Date(nowMs).toISOString(),
          ...overrides,
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("fetchUpstoxQuotes", () => {
  it("returns unavailable without a configured token and does not call fetch", async () => {
    const fetcher = vi.fn();
    const result = await fetchUpstoxQuotes([instrument], {
      maxAgeMs: 5 * 60 * 1000,
      nowMs,
      fetcher,
    });
    expect(result[0].result.status).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps provider instrument identity and preserves trade/retrieval timestamps", async () => {
    const fetcher = vi.fn(async () => responseFor());
    const result = await fetchUpstoxQuotes([instrument], {
      token: "test-token",
      maxAgeMs: 5 * 60 * 1000,
      nowMs,
      fetcher,
    });
    expect(result[0].result.status).toBe("available");
    if (result[0].result.status === "available") {
      expect(result[0].result.quote.price).toBe(125.5);
      expect(result[0].result.quote.observedAt).toBe(new Date(nowMs - 60_000).toISOString());
      expect(result[0].result.quote.retrievedAt).toBe(new Date(nowMs).toISOString());
      expect(result[0].result.quote.providerInstrumentId).toBe(instrument.providerInstrumentId);
    }
  });

  it("marks old last-trade prices stale even if the response was retrieved now", async () => {
    const fetcher = vi.fn(async () =>
      responseFor({ last_trade_time: String(nowMs - 24 * 60 * 60 * 1000) }),
    );
    const result = await fetchUpstoxQuotes([instrument], {
      token: "test-token",
      maxAgeMs: 5 * 60 * 1000,
      nowMs,
      fetcher,
    });
    expect(result[0].result.status).toBe("stale");
  });

  it("rejects non-positive provider prices", async () => {
    const fetcher = vi.fn(async () => responseFor({ last_price: 0 }));
    const result = await fetchUpstoxQuotes([instrument], {
      token: "test-token",
      maxAgeMs: 5 * 60 * 1000,
      nowMs,
      fetcher,
    });
    expect(result[0].result.status).toBe("invalid");
  });

  it("does not query an instrument without a verified provider key", async () => {
    const fetcher = vi.fn(async () => responseFor());
    const result = await fetchUpstoxQuotes(
      [{ ...instrument, instrumentId: "NSE:UNKNOWN", providerInstrumentId: undefined }],
      { token: "test-token", maxAgeMs: 5 * 60 * 1000, nowMs, fetcher },
    );
    expect(result[0].result.status).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps authentication and rate-limit errors to unavailable states", async () => {
    const unauthorizedFetcher = vi.fn(async () => new Response("", { status: 401 }));
    const unauthorized = await fetchUpstoxQuotes([instrument], {
      token: "test-token",
      maxAgeMs: 5 * 60 * 1000,
      nowMs,
      fetcher: unauthorizedFetcher,
    });
    expect(unauthorized[0].result.status).toBe("unavailable");

    const limitedFetcher = vi.fn(async () => new Response("", { status: 429 }));
    const limited = await fetchUpstoxQuotes([instrument], {
      token: "test-token",
      maxAgeMs: 5 * 60 * 1000,
      nowMs,
      fetcher: limitedFetcher,
    });
    expect(limited[0].result.status).toBe("unavailable");
  });
});

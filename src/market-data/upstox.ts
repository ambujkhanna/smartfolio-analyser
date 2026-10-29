import type { InstrumentRecord } from "../domain/instrument";
import { validateQuote, type MarketQuote, type QuoteValidation } from "../domain/quote";

interface UpstoxQuoteRecord {
  instrument_token?: unknown;
  last_price?: unknown;
  last_trade_time?: unknown;
  timestamp?: unknown;
}

export interface UpstoxQuoteResult {
  instrumentId: string;
  result: QuoteValidation;
}

export interface UpstoxQuoteOptions {
  /** Supply from a server-side environment variable; never from client input. */
  token?: string;
  maxAgeMs: number;
  nowMs?: number;
  fetcher?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toEpochMilliseconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed) || !Number.isFinite(new Date(parsed).getTime())) return null;
  return parsed;
}

function unavailable(instrumentId: string, reason: string): UpstoxQuoteResult {
  return { instrumentId, result: { status: "unavailable", reason } };
}

function invalid(instrumentId: string, reason: string): UpstoxQuoteResult {
  return { instrumentId, result: { status: "invalid", reason } };
}

function findQuoteRecord(
  payload: unknown,
  providerInstrumentId: string,
): UpstoxQuoteRecord | undefined {
  if (!isRecord(payload) || payload.status !== "success" || !isRecord(payload.data)) return undefined;
  const record = Object.values(payload.data).find(
    (value) => isRecord(value) && value.instrument_token === providerInstrumentId,
  );
  return isRecord(record) ? record as UpstoxQuoteRecord : undefined;
}

/**
 * Fetches and validates quotes using Upstox Market Quote V3.
 * It only accepts provider instrument keys from the instrument master and never guesses keys.
 * The caller must invoke this from a server-only route/service and supply a server-side token.
 */
export async function fetchUpstoxQuotes(
  instruments: readonly InstrumentRecord[],
  options: UpstoxQuoteOptions,
): Promise<UpstoxQuoteResult[]> {
  const nowMs = options.nowMs ?? Date.now();
  const retrievedAt = new Date(nowMs).toISOString();
  const fetcher = options.fetcher ?? fetch;
  const results = new Map<string, UpstoxQuoteResult>();

  if (!options.token?.trim()) {
    return instruments.map((instrument) =>
      unavailable(instrument.instrumentId, "Upstox credentials are not configured on the server."),
    );
  }

  const eligible: InstrumentRecord[] = [];
  for (const instrument of instruments) {
    if (!instrument.providerInstrumentId?.trim()) {
      results.set(
        instrument.instrumentId,
        unavailable(instrument.instrumentId, "No verified Upstox instrument key is mapped to this instrument."),
      );
    } else {
      eligible.push(instrument);
    }
  }

  // The provider documents a maximum of 500 instrument keys per request.
  for (let offset = 0; offset < eligible.length; offset += 500) {
    const batch = eligible.slice(offset, offset + 500);
    const keys = batch.map((instrument) => instrument.providerInstrumentId as string);
    const url = new URL("https://api.upstox.com/v3/market-quote/quotes");
    url.searchParams.set("instrument_key", keys.join(","));

    let response: Response;
    try {
      response = await fetcher(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + options.token,
        },
        cache: "no-store",
      });
    } catch {
      for (const instrument of batch) {
        results.set(instrument.instrumentId, unavailable(instrument.instrumentId, "Unable to reach the Upstox quote service."));
      }
      continue;
    }

    if (!response.ok) {
      const reason =
        response.status === 401 || response.status === 403
          ? "Upstox rejected the configured credentials. Check the server environment setting."
          : response.status === 429
            ? "Upstox rate limit was reached; retry later."
            : `Upstox quote service returned HTTP ${response.status}.`;
      for (const instrument of batch) {
        results.set(instrument.instrumentId, unavailable(instrument.instrumentId, reason));
      }
      continue;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      for (const instrument of batch) {
        results.set(instrument.instrumentId, invalid(instrument.instrumentId, "Upstox returned a response that was not valid JSON."));
      }
      continue;
    }

    for (const instrument of batch) {
      const providerKey = instrument.providerInstrumentId as string;
      const record = findQuoteRecord(payload, providerKey);
      if (!record) {
        results.set(
          instrument.instrumentId,
          unavailable(instrument.instrumentId, "Upstox did not return a quote matching the requested instrument key."),
        );
        continue;
      }

      const tradeTime = toEpochMilliseconds(record.last_trade_time);
      if (tradeTime === null) {
        results.set(
          instrument.instrumentId,
          invalid(instrument.instrumentId, "Upstox did not return a valid last-trade timestamp; the price cannot be treated as current."),
        );
        continue;
      }

      const providerTimestampMs = toEpochMilliseconds(record.timestamp);
      const quote: MarketQuote = {
        instrumentId: instrument.instrumentId,
        price: typeof record.last_price === "number" ? record.last_price : Number.NaN,
        currency: instrument.currency,
        source: "Upstox Market Quote V3",
        quoteType: "real-time",
        observedAt: new Date(tradeTime).toISOString(),
        retrievedAt,
        ...(providerTimestampMs === null ? {} : { providerTimestamp: new Date(providerTimestampMs).toISOString() }),
        providerInstrumentId: providerKey,
      };

      results.set(
        instrument.instrumentId,
        {
          instrumentId: instrument.instrumentId,
          result: validateQuote(quote, instrument.instrumentId, {
            nowMs,
            maxAgeMs: options.maxAgeMs,
            expectedCurrency: instrument.currency,
          }),
        },
      );
    }
  }

  return instruments.map(
    (instrument) =>
      results.get(instrument.instrumentId) ??
      unavailable(instrument.instrumentId, "No quote result was produced for this instrument."),
  );
}

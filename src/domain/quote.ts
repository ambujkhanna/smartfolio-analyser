export type QuoteType = "real-time" | "delayed" | "end-of-day" | "nav";

export interface MarketQuote {
  /** Canonical instrument identity; display symbols alone are not sufficient. */
  instrumentId: string;
  price: number;
  currency: string;
  source: string;
  quoteType: QuoteType;
  /** ISO-8601 observation time or NAV valuation date represented as ISO-8601. */
  observedAt: string;
  /** Identifier used by the quote provider, when available. */
  providerInstrumentId?: string;
}

export type QuoteValidation =
  | { status: "available"; quote: MarketQuote; ageMs: number }
  | { status: "unavailable"; reason: string }
  | { status: "invalid"; reason: string }
  | { status: "mismatched"; reason: string }
  | { status: "stale"; quote: MarketQuote; ageMs: number };

/**
 * Validates a candidate quote before it can be used in calculations.
 * It never substitutes a default price. The current time is injectable for deterministic tests.
 */
export function validateQuote(
  candidate: MarketQuote | null | undefined,
  expectedInstrumentId: string,
  options: {
    nowMs?: number;
    maxAgeMs: number;
    expectedCurrency?: string;
  },
): QuoteValidation {
  if (!candidate) {
    return { status: "unavailable", reason: "No quote was provided." };
  }

  if (
    typeof expectedInstrumentId !== "string" ||
    !expectedInstrumentId.trim() ||
    typeof candidate.instrumentId !== "string" ||
    candidate.instrumentId !== expectedInstrumentId
  ) {
    return {
      status: "mismatched",
      reason: "Quote instrument identity does not match the requested instrument.",
    };
  }

  if (typeof candidate.price !== "number" || !Number.isFinite(candidate.price) || candidate.price <= 0) {
    return { status: "invalid", reason: "Quote price must be a finite positive number." };
  }

  if (
    typeof candidate.currency !== "string" ||
    !candidate.currency.trim() ||
    (options.expectedCurrency && candidate.currency !== options.expectedCurrency)
  ) {
    return { status: "mismatched", reason: "Quote currency is missing or does not match the expected currency." };
  }

  if (typeof candidate.source !== "string" || !candidate.source.trim()) {
    return { status: "invalid", reason: "Quote source is required." };
  }

  if (typeof candidate.observedAt !== "string") {
    return { status: "invalid", reason: "Quote observation time is missing or invalid." };
  }

  if (!["real-time", "delayed", "end-of-day", "nav"].includes(candidate.quoteType)) {
    return { status: "invalid", reason: "Quote type is missing or unsupported." };
  }

  const observedAtMs = Date.parse(candidate.observedAt);
  if (!Number.isFinite(observedAtMs)) {
    return { status: "invalid", reason: "Quote observation time is missing or invalid." };
  }

  const nowMs = options.nowMs ?? Date.now();
  const ageMs = nowMs - observedAtMs;
  if (ageMs < 0) {
    return { status: "invalid", reason: "Quote observation time is in the future." };
  }

  if (!Number.isFinite(options.maxAgeMs) || options.maxAgeMs < 0) {
    return { status: "invalid", reason: "Maximum quote age must be a finite non-negative number." };
  }

  if (ageMs > options.maxAgeMs) {
    return { status: "stale", quote: candidate, ageMs };
  }

  return { status: "available", quote: candidate, ageMs };
}

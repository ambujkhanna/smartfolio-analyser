export type AssetType = "equity" | "etf" | "mutual-fund" | "other";
export type Exchange = "NSE" | "BSE" | "AMFI" | "UNKNOWN";

export interface InstrumentRecord {
  /** Stable canonical identity, distinct from display symbol. */
  instrumentId: string;
  displayName: string;
  assetType: AssetType;
  currency: string;
  symbol?: string;
  exchange?: Exchange;
  isin?: string;
  providerInstrumentId?: string;
}

export interface InstrumentReference {
  instrumentId?: string;
  isin?: string;
  symbol?: string;
  exchange?: Exchange;
  assetType?: AssetType;
}

export type InstrumentResolution =
  | {
      status: "resolved";
      instrument: InstrumentRecord;
      confidence: "high" | "medium";
      matchedBy: "instrument-id" | "isin-exchange" | "isin" | "symbol-exchange" | "unique-symbol";
    }
  | {
      status: "ambiguous";
      candidates: InstrumentRecord[];
      reason: string;
    }
  | {
      status: "unresolved";
      reason: string;
    };

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function normalizeExchange(value: Exchange | undefined): Exchange | undefined {
  if (!value) return undefined;
  const normalized = normalize(value);
  if (normalized === "NSE" || normalized === "NSE_EQ") return "NSE";
  if (normalized === "BSE" || normalized === "BSE_EQ") return "BSE";
  if (normalized === "AMFI") return "AMFI";
  return "UNKNOWN";
}

/**
 * Exact, deterministic instrument matching only. Fuzzy matching is intentionally
 * excluded: ambiguous or unresolved references must be reviewed before pricing.
 */
export function resolveInstrument(
  reference: InstrumentReference,
  master: readonly InstrumentRecord[],
): InstrumentResolution {
  const candidates = master.filter((item) =>
    reference.assetType ? item.assetType === reference.assetType : true,
  );

  const explicitId = normalize(reference.instrumentId);
  if (explicitId) {
    const matches = candidates.filter((item) => normalize(item.instrumentId) === explicitId);
    if (matches.length === 1) return { status: "resolved", instrument: matches[0], confidence: "high", matchedBy: "instrument-id" };
    if (matches.length > 1) return { status: "ambiguous", candidates: matches, reason: "Canonical instrument ID appears more than once in the instrument master." };
    return { status: "unresolved", reason: "The supplied canonical instrument ID was not found in the instrument master." };
  }

  const isin = normalize(reference.isin);
  const exchange = normalizeExchange(reference.exchange);
  if (isin && exchange && exchange !== "UNKNOWN") {
    const matches = candidates.filter(
      (item) => normalize(item.isin) === isin && normalizeExchange(item.exchange) === exchange,
    );
    if (matches.length === 1) return { status: "resolved", instrument: matches[0], confidence: "high", matchedBy: "isin-exchange" };
    if (matches.length > 1) return { status: "ambiguous", candidates: matches, reason: "ISIN and exchange match more than one master record." };
    return { status: "unresolved", reason: "The supplied ISIN and exchange combination was not found in the instrument master." };
  }

  if (isin) {
    const matches = candidates.filter((item) => normalize(item.isin) === isin);
    if (matches.length === 1) return { status: "resolved", instrument: matches[0], confidence: "medium", matchedBy: "isin" };
    if (matches.length > 1) return { status: "ambiguous", candidates: matches, reason: "ISIN maps to multiple exchange/provider records; exchange must be specified." };
  }

  const symbol = normalize(reference.symbol);
  if (symbol && exchange && exchange !== "UNKNOWN") {
    const matches = candidates.filter(
      (item) => normalize(item.symbol) === symbol && normalizeExchange(item.exchange) === exchange,
    );
    if (matches.length === 1) return { status: "resolved", instrument: matches[0], confidence: "medium", matchedBy: "symbol-exchange" };
    if (matches.length > 1) return { status: "ambiguous", candidates: matches, reason: "Symbol and exchange match more than one master record." };
    return { status: "unresolved", reason: "The supplied symbol and exchange combination was not found in the instrument master." };
  }

  if (symbol) {
    const matches = candidates.filter((item) => normalize(item.symbol) === symbol);
    if (matches.length === 1) return { status: "resolved", instrument: matches[0], confidence: "medium", matchedBy: "unique-symbol" };
    if (matches.length > 1) return { status: "ambiguous", candidates: matches, reason: "Symbol is not unique; specify ISIN or exchange." };
  }

  return {
    status: "unresolved",
    reason: "No exact instrument-master match was found. Do not use a quote until identity is resolved.",
  };
}

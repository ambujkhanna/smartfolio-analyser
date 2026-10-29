import type { QuoteValidation } from "../domain/quote";

export interface OpenPositionInput {
  instrumentId: string;
  quantity: number;
  /** Total remaining cost basis. Null/undefined means the original cost is unknown. */
  costBasisTotal?: number | null;
}

export type PositionValuation =
  | {
      status: "valued";
      instrumentId: string;
      quantity: number;
      marketValue: number;
      costBasisTotal: number;
      unrealizedPnl: number;
      quoteSource: string;
      quoteObservedAt: string;
      quoteType: string;
    }
  | {
      status: "partial";
      instrumentId: string;
      quantity: number;
      marketValue: number;
      costBasisTotal: null;
      unrealizedPnl: null;
      reason: string;
      quoteSource: string;
      quoteObservedAt: string;
      quoteType: string;
    }
  | {
      status: "unavailable";
      instrumentId: string;
      quantity: number | null;
      marketValue: null;
      costBasisTotal: number | null;
      unrealizedPnl: null;
      reason: string;
    };

/**
 * Values an open position only when a fresh, validated quote is explicitly supplied.
 * This function does not fetch prices, choose a fallback, or infer missing cost basis.
 */
export function valueOpenPosition(
  position: OpenPositionInput,
  quoteResult: QuoteValidation,
): PositionValuation {
  const instrumentId = typeof position.instrumentId === "string" ? position.instrumentId : "";
  const quantity = position.quantity;
  const costBasis = position.costBasisTotal;

  if (!instrumentId.trim()) {
    return unavailable(instrumentId, null, null, "Position instrument identity is missing.");
  }

  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    return unavailable(instrumentId, null, null, "Open position quantity must be a finite positive number.");
  }

  if (
    costBasis !== null &&
    costBasis !== undefined &&
    (typeof costBasis !== "number" || !Number.isFinite(costBasis) || costBasis < 0)
  ) {
    return unavailable(instrumentId, quantity, null, "Cost basis must be a finite non-negative number when supplied.");
  }

  if (quoteResult.status !== "available") {
    const reason =
      quoteResult.status === "stale"
        ? "Quote is stale; current market value and unrealized P&L are unavailable."
        : quoteResult.reason;
    return unavailable(instrumentId, quantity, costBasis ?? null, reason);
  }

  if (quoteResult.quote.instrumentId !== instrumentId) {
    return unavailable(instrumentId, quantity, costBasis ?? null, "Validated quote instrument does not match the position.");
  }

  const marketValue = quantity * quoteResult.quote.price;
  if (!Number.isFinite(marketValue)) {
    return unavailable(instrumentId, quantity, costBasis ?? null, "Calculated market value is outside the supported numeric range.");
  }

  const quoteMetadata = {
    quoteSource: quoteResult.quote.source,
    quoteObservedAt: quoteResult.quote.observedAt,
    quoteType: quoteResult.quote.quoteType,
  };

  if (costBasis === null || costBasis === undefined) {
    return {
      status: "partial",
      instrumentId,
      quantity,
      marketValue,
      costBasisTotal: null,
      unrealizedPnl: null,
      reason: "Market value is available, but unrealized P&L is unavailable because cost basis is missing.",
      ...quoteMetadata,
    };
  }

  const unrealizedPnl = marketValue - costBasis;
  if (!Number.isFinite(unrealizedPnl)) {
    return unavailable(instrumentId, quantity, costBasis, "Calculated unrealized P&L is outside the supported numeric range.");
  }

  return {
    status: "valued",
    instrumentId,
    quantity,
    marketValue,
    costBasisTotal: costBasis,
    unrealizedPnl,
    ...quoteMetadata,
  };
}

function unavailable(
  instrumentId: string,
  quantity: number | null,
  costBasisTotal: number | null,
  reason: string,
): PositionValuation {
  return {
    status: "unavailable",
    instrumentId,
    quantity,
    marketValue: null,
    costBasisTotal,
    unrealizedPnl: null,
    reason,
  };
}

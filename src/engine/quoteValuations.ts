import type { QuoteValidation } from "../domain/quote";
import type { LedgerResult } from "./buildLedger";
import { valueOpenPosition, type PositionValuation } from "./valuePosition";

/**
 * Converts provider quote results into the valuation shape consumed by the
 * portfolio P&L aggregator. Missing quotes are omitted so the aggregator can
 * report the position as unavailable instead of silently using zero.
 */
export function buildPositionValuations(
  ledger: LedgerResult,
  quotes: Record<string, QuoteValidation>,
): Record<string, PositionValuation | undefined> {
  const valuations: Record<string, PositionValuation | undefined> = {};

  for (const instrument of ledger.instruments) {
    if (instrument.openQuantity <= 0) continue;
    const quote = quotes[instrument.instrumentId];
    if (!quote) continue;

    valuations[instrument.instrumentId] = valueOpenPosition(
      {
        instrumentId: instrument.instrumentId,
        quantity: instrument.openQuantity,
        costBasisTotal: instrument.openCostBasisTotal,
      },
      quote,
    );
  }

  return valuations;
}

import type { InstrumentLedger, LedgerIssue, LedgerResult } from "./buildLedger";
import type { PositionValuation } from "./valuePosition";

export interface InstrumentPnL {
  instrumentId: string;
  openQuantity: number;
  openCostBasisTotal: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  marketValue: number | null;
  positionBreakEvenPrice: number | null;
  lifecycleRecoveryPrice: number | null;
  completeness: "complete" | "partial" | "unavailable";
  reason?: string;
}

export interface PortfolioPnL {
  realizedPnl: number | null;
  realizedPnlKnownSubtotal: number;
  unrealizedPnl: number | null;
  marketValue: number | null;
  economicPnl: number | null;
  buyOutflows: number;
  netSaleProceeds: number;
  standaloneFees: number;
  dividends: number;
  knownOpeningBasis: number;
  instrumentMetrics: InstrumentPnL[];
  warnings: LedgerIssue[];
  isComplete: boolean;
}

function valuationFor(
  instrument: InstrumentLedger,
  valuations: Record<string, PositionValuation | undefined>,
): PositionValuation | undefined {
  const valuation = valuations[instrument.instrumentId];
  if (valuation && valuation.instrumentId !== instrument.instrumentId) return undefined;
  return valuation;
}

/**
 * Aggregates ledger cash flows and explicit position valuations.
 * Missing/stale quote values and incomplete cost/history never become zero.
 */
export function calculatePortfolioPnL(
  ledger: LedgerResult,
  valuations: Record<string, PositionValuation | undefined>,
): PortfolioPnL {
  const warnings: LedgerIssue[] = [...ledger.warnings];
  let marketValueSubtotal = 0;
  let marketValueComplete = true;
  let unrealizedPnlSubtotal = 0;
  let unrealizedPnlComplete = true;

  const instrumentMetrics: InstrumentPnL[] = ledger.instruments.map((instrument) => {
    if (instrument.openQuantity <= 1e-9) {
      return {
        instrumentId: instrument.instrumentId,
        openQuantity: 0,
        openCostBasisTotal: 0,
        realizedPnl: instrument.realizedPnl,
        unrealizedPnl: 0,
        marketValue: 0,
        positionBreakEvenPrice: null,
        lifecycleRecoveryPrice: null,
        completeness: instrument.realizedPnlComplete ? "complete" : "partial",
        ...(instrument.realizedPnlComplete ? {} : { reason: "Realized P&L is incomplete because source history or transaction ordering is ambiguous." }),
      };
    }

    const valuation = valuationFor(instrument, valuations);
    let marketValue: number | null = null;
    let unrealizedPnl: number | null = null;
    let reason: string | undefined;

    if (!valuation || valuation.status === "unavailable") {
      marketValueComplete = false;
      unrealizedPnlComplete = false;
      reason = valuation?.status === "unavailable"
        ? valuation.reason
        : "No validated valuation was supplied for this open position.";
      warnings.push({
        code: "MISSING_POSITION_VALUATION",
        instrumentId: instrument.instrumentId,
        message: reason,
      });
    } else {
      marketValue = valuation.marketValue;
      marketValueSubtotal += valuation.marketValue;
      if (!Number.isFinite(marketValueSubtotal)) {
        marketValueComplete = false;
        warnings.push({
          code: "NUMERIC_OVERFLOW",
          instrumentId: instrument.instrumentId,
          message: "Portfolio market value total exceeds the supported numeric range.",
        });
      }
      if (valuation.status === "valued") {
        unrealizedPnl = valuation.unrealizedPnl;
        unrealizedPnlSubtotal += valuation.unrealizedPnl;
        if (!Number.isFinite(unrealizedPnlSubtotal)) {
          unrealizedPnlComplete = false;
          warnings.push({
            code: "NUMERIC_OVERFLOW",
            instrumentId: instrument.instrumentId,
            message: "Portfolio unrealized P&L total exceeds the supported numeric range.",
          });
        }
      } else {
        unrealizedPnlComplete = false;
        reason = valuation.reason;
        warnings.push({
          code: "MISSING_COST_BASIS",
          instrumentId: instrument.instrumentId,
          message: reason,
        });
      }
    }

    if (instrument.openCostBasisTotal === null) {
      unrealizedPnlComplete = false;
      reason ??= "Remaining cost basis is unknown.";
    }

    const positionBreakEvenPrice =
      instrument.openCostBasisTotal !== null && instrument.openQuantity > 0
        ? instrument.openCostBasisTotal / instrument.openQuantity
        : null;

    const canCalculateLifecycleRecovery =
      ledger.isComplete &&
      instrument.realizedPnlComplete &&
      !instrument.hasUnknownOpeningBasis &&
      instrument.openQuantity > 0 &&
      ledger.cashFlows.unallocatedStandaloneFees === 0 &&
      ledger.cashFlows.unallocatedDividends === 0;

    const lifecycleNetInvested =
      instrument.buyOutflows +
      instrument.knownOpeningBasis +
      instrument.standaloneFees -
      instrument.netSaleProceeds -
      instrument.dividends;

    const lifecycleRecoveryPrice =
      canCalculateLifecycleRecovery && Number.isFinite(lifecycleNetInvested)
        ? lifecycleNetInvested / instrument.openQuantity
        : null;

    const completeness: InstrumentPnL["completeness"] =
      marketValue !== null && unrealizedPnl !== null && instrument.realizedPnlComplete
        ? "complete"
        : marketValue !== null
          ? "partial"
          : "unavailable";

    return {
      instrumentId: instrument.instrumentId,
      openQuantity: instrument.openQuantity,
      openCostBasisTotal: instrument.openCostBasisTotal,
      realizedPnl: instrument.realizedPnl,
      unrealizedPnl,
      marketValue,
      positionBreakEvenPrice,
      lifecycleRecoveryPrice,
      completeness,
      ...(reason ? { reason } : {}),
    };
  });

  const realizedPnlComplete = ledger.instruments.every((instrument) => instrument.realizedPnl !== null);
  const realizedPnlKnownSubtotal = ledger.instruments.reduce(
    (sum, instrument) => sum + instrument.realizedPnlKnownSubtotal,
    0,
  );
  const realizedPnl = realizedPnlComplete ? realizedPnlKnownSubtotal : null;

  const marketValue = marketValueComplete ? marketValueSubtotal : null;
  const unrealizedPnl = unrealizedPnlComplete ? unrealizedPnlSubtotal : null;

  const economicPnlComplete =
    ledger.isComplete &&
    marketValue !== null &&
    Number.isFinite(
      ledger.cashFlows.netSaleProceeds +
      marketValue +
      ledger.cashFlows.dividends -
      ledger.cashFlows.buyOutflows -
      ledger.cashFlows.standaloneFees -
      ledger.cashFlows.knownOpeningBasis,
    );

  const economicPnl = economicPnlComplete
    ? ledger.cashFlows.netSaleProceeds +
      (marketValue as number) +
      ledger.cashFlows.dividends -
      ledger.cashFlows.buyOutflows -
      ledger.cashFlows.standaloneFees -
      ledger.cashFlows.knownOpeningBasis
    : null;

  const isComplete =
    ledger.isComplete &&
    realizedPnl !== null &&
    unrealizedPnl !== null &&
    marketValue !== null &&
    economicPnl !== null;

  return {
    realizedPnl,
    realizedPnlKnownSubtotal,
    unrealizedPnl,
    marketValue,
    economicPnl,
    buyOutflows: ledger.cashFlows.buyOutflows,
    netSaleProceeds: ledger.cashFlows.netSaleProceeds,
    standaloneFees: ledger.cashFlows.standaloneFees,
    dividends: ledger.cashFlows.dividends,
    knownOpeningBasis: ledger.cashFlows.knownOpeningBasis,
    instrumentMetrics,
    warnings,
    isComplete,
  };
}

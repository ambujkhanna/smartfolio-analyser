import { validateTransaction, type CanonicalTransaction, type TransactionKind } from "../domain/transaction";

export interface LedgerIssue {
  code: string;
  message: string;
  transactionId?: string;
  instrumentId?: string;
}

export interface LotSnapshot {
  openedByTransactionId: string;
  remainingQuantity: number;
  remainingCostTotal: number | null;
}

export interface InstrumentLedger {
  instrumentId: string;
  openQuantity: number;
  /** Null when any remaining lot has unknown cost basis. */
  openCostBasisTotal: number | null;
  /** Null when any applied sale consumed a lot with unknown cost basis. */
  realizedPnl: number | null;
  realizedPnlKnownSubtotal: number;
  realizedPnlComplete: boolean;
  buyOutflows: number;
  netSaleProceeds: number;
  standaloneFees: number;
  dividends: number;
  knownOpeningBasis: number;
  hasUnknownOpeningBasis: boolean;
  lots: LotSnapshot[];
}

export interface LedgerCashFlows {
  buyOutflows: number;
  netSaleProceeds: number;
  standaloneFees: number;
  dividends: number;
  knownOpeningBasis: number;
  hasUnknownOpeningBasis: boolean;
  unallocatedStandaloneFees: number;
  unallocatedDividends: number;
}

export interface LedgerResult {
  instruments: InstrumentLedger[];
  cashFlows: LedgerCashFlows;
  warnings: LedgerIssue[];
  errors: LedgerIssue[];
  rejectedTransactionCount: number;
  isComplete: boolean;
}

interface MutableLot {
  openedByTransactionId: string;
  remainingQuantity: number;
  remainingCostTotal: number | null;
}

interface MutableInstrumentLedger {
  instrumentId: string;
  lots: MutableLot[];
  realizedPnlKnownSubtotal: number;
  realizedPnlComplete: boolean;
  buyOutflows: number;
  netSaleProceeds: number;
  standaloneFees: number;
  dividends: number;
  knownOpeningBasis: number;
  hasUnknownOpeningBasis: boolean;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Fields that change accounting results; source file/row are deliberately excluded. */
function economicSignature(transaction: CanonicalTransaction): string {
  return JSON.stringify([
    transaction.kind,
    transaction.instrumentId ?? null,
    Date.parse(transaction.occurredAt),
    transaction.currency,
    transaction.quantity ?? null,
    transaction.unitPrice ?? null,
    transaction.amount ?? null,
    transaction.charges ?? null,
  ]);
}

function describeSources(group: CanonicalTransaction[]): string {
  return group.map((transaction) => `${transaction.source.fileName} row ${transaction.source.rowNumber}`).join(", ");
}

function stableTransactionSort(a: CanonicalTransaction, b: CanonicalTransaction): number {
  const timeDifference = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
  if (timeDifference !== 0) return timeDifference;
  const fileDifference = a.source.fileName.localeCompare(b.source.fileName);
  if (fileDifference !== 0) return fileDifference;
  if (a.source.rowNumber !== b.source.rowNumber) return a.source.rowNumber - b.source.rowNumber;
  return a.transactionId.localeCompare(b.transactionId);
}

function instrumentOf(kind: TransactionKind, instrumentId: string | undefined): string | undefined {
  if (kind === "buy" || kind === "sell" || kind === "opening-balance") return instrumentId;
  return instrumentId;
}

/**
 * Builds a deterministic FIFO ledger from canonical transaction rows.
 * Invalid/duplicate rows and oversells are reported; they are never silently applied.
 * This function performs no quote fetching and makes no market-price assumptions.
 */
export function buildLedger(input: unknown[]): LedgerResult {
  const warnings: LedgerIssue[] = [];
  const errors: LedgerIssue[] = [];
  let rejectedTransactionCount = 0;

  const validTransactions: CanonicalTransaction[] = [];
  input.forEach((row, index) => {
    const validation = validateTransaction(row);
    if (validation.status === "invalid") {
      rejectedTransactionCount += 1;
      errors.push({
        code: "INVALID_TRANSACTION",
        message: `Input row ${index + 1} was rejected: ${validation.issues.map((issue) => issue.field + ": " + issue.message).join(" ")}`,
      });
      return;
    }
    validTransactions.push(validation.transaction);
  });

  const ids = new Map<string, CanonicalTransaction[]>();
  for (const transaction of validTransactions) {
    const group = ids.get(transaction.transactionId) ?? [];
    group.push(transaction);
    ids.set(transaction.transactionId, group);
  }

  // Re-importing the same or an overlapping file yields rows with the same ID
  // and identical economic content: keep exactly one and report the merge.
  // Same ID with different content is a genuine conflict: exclude all copies.
  const duplicateIds = new Set<string>();
  const mergedDuplicates = new Set<CanonicalTransaction>();
  for (const [id, group] of ids) {
    if (group.length < 2) continue;
    const signature = economicSignature(group[0]);
    if (group.every((transaction) => economicSignature(transaction) === signature)) {
      group.slice(1).forEach((transaction) => mergedDuplicates.add(transaction));
      warnings.push({
        code: "DUPLICATE_TRANSACTION_MERGED",
        transactionId: id,
        message: `Transaction ID "${id}" appears ${group.length} times with identical details (${describeSources(group)}); it was counted once.`,
      });
      continue;
    }
    duplicateIds.add(id);
    rejectedTransactionCount += group.length;
    errors.push({
      code: "DUPLICATE_TRANSACTION_ID",
      transactionId: id,
      message: `Transaction ID "${id}" occurs ${group.length} times with conflicting details (${describeSources(group)}); all rows with this ID were excluded to avoid double counting.`,
    });
  }

  const transactions = validTransactions
    .filter((transaction) => !duplicateIds.has(transaction.transactionId) && !mergedDuplicates.has(transaction))
    .sort(stableTransactionSort);

  const byInstrument = new Map<string, MutableInstrumentLedger>();
  const getLedger = (instrumentId: string): MutableInstrumentLedger => {
    let ledger = byInstrument.get(instrumentId);
    if (!ledger) {
      ledger = {
        instrumentId,
        lots: [],
        realizedPnlKnownSubtotal: 0,
        realizedPnlComplete: true,
        buyOutflows: 0,
        netSaleProceeds: 0,
        standaloneFees: 0,
        dividends: 0,
        knownOpeningBasis: 0,
        hasUnknownOpeningBasis: false,
      };
      byInstrument.set(instrumentId, ledger);
    }
    return ledger;
  };

  // Date-only rows or exact timestamp ties can make same-instrument order ambiguous.
  const datedInstrumentRows = new Map<string, CanonicalTransaction[]>();
  for (const transaction of transactions) {
    const instrumentId = instrumentOf(transaction.kind, transaction.instrumentId);
    if (!instrumentId) continue;
    const date = transaction.occurredAt.slice(0, 10);
    const key = instrumentId + "|" + date;
    const rows = datedInstrumentRows.get(key) ?? [];
    rows.push(transaction);
    datedInstrumentRows.set(key, rows);
  }
  const ambiguousKeys = new Set<string>();
  for (const [key, rows] of datedInstrumentRows) {
    if (
      rows.length > 1 &&
      rows.some((row) => isDateOnly(row.occurredAt)) &&
      rows.some((row) => row.kind === "buy" || row.kind === "sell" || row.kind === "opening-balance")
    ) {
      ambiguousKeys.add(key);
      warnings.push({
        code: "AMBIGUOUS_ORDER",
        instrumentId: rows[0].instrumentId,
        message: `Multiple same-day transactions for ${rows[0].instrumentId} lack time precision; ledger order follows source filename/row and results may be incomplete.`,
      });
    }
  }

  const cashFlows: LedgerCashFlows = {
    buyOutflows: 0,
    netSaleProceeds: 0,
    standaloneFees: 0,
    dividends: 0,
    knownOpeningBasis: 0,
    hasUnknownOpeningBasis: false,
    unallocatedStandaloneFees: 0,
    unallocatedDividends: 0,
  };

  for (const transaction of transactions) {
    const instrumentId = transaction.instrumentId;
    if (transaction.kind === "buy") {
      const ledger = getLedger(instrumentId as string);
      const quantity = transaction.quantity as number;
      const costTotal = quantity * (transaction.unitPrice as number) + (transaction.charges ?? 0);
      if (!Number.isFinite(costTotal)) {
        rejectedTransactionCount += 1;
        errors.push({ code: "NUMERIC_OVERFLOW", transactionId: transaction.transactionId, instrumentId, message: "Buy cost is outside the supported numeric range." });
        continue;
      }
      ledger.lots.push({
        openedByTransactionId: transaction.transactionId,
        remainingQuantity: quantity,
        remainingCostTotal: costTotal,
      });
      ledger.buyOutflows += costTotal;
      cashFlows.buyOutflows += costTotal;
      continue;
    }

    if (transaction.kind === "opening-balance") {
      const ledger = getLedger(instrumentId as string);
      const quantity = transaction.quantity as number;
      if (transaction.unitPrice === undefined) {
        ledger.lots.push({
          openedByTransactionId: transaction.transactionId,
          remainingQuantity: quantity,
          remainingCostTotal: null,
        });
        cashFlows.hasUnknownOpeningBasis = true;
        ledger.hasUnknownOpeningBasis = true;
        warnings.push({
          code: "UNKNOWN_OPENING_BASIS",
          transactionId: transaction.transactionId,
          instrumentId,
          message: `Opening quantity for ${instrumentId} has no known acquisition cost; cost-dependent metrics will be incomplete.`,
        });
      } else {
        const costTotal = quantity * transaction.unitPrice + (transaction.charges ?? 0);
        if (!Number.isFinite(costTotal)) {
          rejectedTransactionCount += 1;
          errors.push({ code: "NUMERIC_OVERFLOW", transactionId: transaction.transactionId, instrumentId, message: "Opening cost is outside the supported numeric range." });
          continue;
        }
        ledger.lots.push({
          openedByTransactionId: transaction.transactionId,
          remainingQuantity: quantity,
          remainingCostTotal: costTotal,
        });
        ledger.knownOpeningBasis += costTotal;
        cashFlows.knownOpeningBasis += costTotal;
      }
      continue;
    }

    if (transaction.kind === "sell") {
      const ledger = getLedger(instrumentId as string);
      const quantity = transaction.quantity as number;
      const openQuantity = ledger.lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
      if (quantity > openQuantity + 1e-9) {
        rejectedTransactionCount += 1;
        errors.push({
          code: "OVERSELL",
          transactionId: transaction.transactionId,
          instrumentId,
          message: `Sale quantity ${quantity} exceeds reconstructed open quantity ${openQuantity} for ${instrumentId}; sale was not applied.`,
        });
        continue;
      }

      const netProceeds = quantity * (transaction.unitPrice as number) - (transaction.charges ?? 0);
      if (!Number.isFinite(netProceeds)) {
        rejectedTransactionCount += 1;
        errors.push({ code: "NUMERIC_OVERFLOW", transactionId: transaction.transactionId, instrumentId, message: "Sale proceeds are outside the supported numeric range." });
        continue;
      }

      let remainingToSell = quantity;
      let allocatedCost = 0;
      let allocatedCostKnown = true;
      for (const lot of ledger.lots) {
        if (remainingToSell <= 1e-9) break;
        if (lot.remainingQuantity <= 1e-9) continue;

        const consumedQuantity = Math.min(lot.remainingQuantity, remainingToSell);
        if (lot.remainingCostTotal === null) {
          allocatedCostKnown = false;
        } else {
          const fraction = consumedQuantity / lot.remainingQuantity;
          const consumedCost = lot.remainingCostTotal * fraction;
          allocatedCost += consumedCost;
          lot.remainingCostTotal -= consumedCost;
        }

        lot.remainingQuantity -= consumedQuantity;
        remainingToSell -= consumedQuantity;
      }

      ledger.lots = ledger.lots.filter((lot) => lot.remainingQuantity > 1e-9);
      ledger.netSaleProceeds += netProceeds;
      cashFlows.netSaleProceeds += netProceeds;
      if (allocatedCostKnown) {
        ledger.realizedPnlKnownSubtotal += netProceeds - allocatedCost;
      } else {
        ledger.realizedPnlComplete = false;
        warnings.push({
          code: "UNKNOWN_SOLD_COST_BASIS",
          transactionId: transaction.transactionId,
          instrumentId,
          message: `Sale for ${instrumentId} consumed units with unknown cost basis; realized P&L is incomplete.`,
        });
      }
      continue;
    }

    if (transaction.kind === "fee") {
      const amount = transaction.amount as number;
      cashFlows.standaloneFees += amount;
      if (instrumentId) {
        getLedger(instrumentId).standaloneFees += amount;
      } else {
        cashFlows.unallocatedStandaloneFees += amount;
      }
      continue;
    }

    if (transaction.kind === "dividend") {
      const amount = transaction.amount as number;
      cashFlows.dividends += amount;
      if (instrumentId) {
        getLedger(instrumentId).dividends += amount;
      } else {
        cashFlows.unallocatedDividends += amount;
      }
    }
  }

  const instruments: InstrumentLedger[] = [...byInstrument.values()]
    .sort((a, b) => a.instrumentId.localeCompare(b.instrumentId))
    .map((ledger) => {
      const openQuantity = ledger.lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
      const hasUnknownOpenCost = ledger.lots.some((lot) => lot.remainingCostTotal === null);
      const openCostBasisTotal = hasUnknownOpenCost
        ? null
        : ledger.lots.reduce((sum, lot) => sum + (lot.remainingCostTotal ?? 0), 0);
      const isAmbiguous = [...ambiguousKeys].some((key) => key.startsWith(ledger.instrumentId + "|"));
      const realizedPnlComplete = ledger.realizedPnlComplete && !isAmbiguous;
      return {
        instrumentId: ledger.instrumentId,
        openQuantity,
        openCostBasisTotal,
        realizedPnl: realizedPnlComplete ? ledger.realizedPnlKnownSubtotal : null,
        realizedPnlKnownSubtotal: ledger.realizedPnlKnownSubtotal,
        realizedPnlComplete,
        buyOutflows: ledger.buyOutflows,
        netSaleProceeds: ledger.netSaleProceeds,
        standaloneFees: ledger.standaloneFees,
        dividends: ledger.dividends,
        knownOpeningBasis: ledger.knownOpeningBasis,
        hasUnknownOpeningBasis: ledger.hasUnknownOpeningBasis,
        lots: ledger.lots.map((lot) => ({ ...lot })),
      };
    });

  const isComplete =
    errors.length === 0 &&
    // A merged identical re-import is informational and does not reduce completeness.
    warnings.every((issue) => issue.code === "DUPLICATE_TRANSACTION_MERGED") &&
    !cashFlows.hasUnknownOpeningBasis &&
    instruments.every((instrument) => instrument.realizedPnlComplete && instrument.openCostBasisTotal !== null);

  return {
    instruments,
    cashFlows,
    warnings,
    errors,
    rejectedTransactionCount,
    isComplete,
  };
}

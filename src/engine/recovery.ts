import type { CanonicalTransaction } from "../domain/transaction";
import type { LedgerResult } from "./buildLedger";
import type { ReconciledHolding } from "./reconcileHoldings";

/**
 * Recovery tracker: the goal is that every underperforming stock reaches at least zero
 * loss overall. These are facts and targets (prices, gaps, losses) — not advice.
 */
export interface HeldRecoveryItem {
  instrumentId: string;
  label: string;
  /** Zero-loss price for the shares held (real break-even, including past booked results). */
  zeroLossPrice: number;
  price: number;
  /** % the price must rise to reach zero loss. */
  gapPercent: number;
  toRecover: number;
  quantity: number;
}

export interface SoldLossItem {
  instrumentId: string;
  label: string;
  /** Net booked loss (positive number). */
  netLoss: number;
  soldQuantity: number;
  averageSalePrice: number;
  /** Average cost of the shares that were sold. */
  averageBuyPrice: number;
  lastSaleDate: string;
  lastSalePrice: number;
}

export function heldRecovery(rows: ReconciledHolding[]): HeldRecoveryItem[] {
  return rows
    .filter((row) => row.lifecycle && row.lifecycle.toRecover > 0 && row.brokerLastPrice && row.lifecycle.breakEvenPrice > 0)
    .map((row) => {
      const life = row.lifecycle!;
      const price = row.brokerLastPrice!;
      return {
        instrumentId: row.isin,
        label: row.symbols[0] ?? row.isin,
        zeroLossPrice: life.breakEvenPrice,
        price,
        gapPercent: ((life.breakEvenPrice - price) / price) * 100,
        toRecover: life.toRecover,
        quantity: row.brokerQuantity,
      };
    })
    .sort((a, b) => a.gapPercent - b.gapPercent);
}

/** Fully sold stocks whose booked result is a net loss (complete history only). */
export function soldAtLoss(ledger: LedgerResult | null, transactions: CanonicalTransaction[], labelOf: (id: string) => string): SoldLossItem[] {
  if (!ledger) return [];
  const withErrors = new Set(ledger.errors.map((issue) => issue.instrumentId).filter(Boolean));
  const sales = new Map<string, CanonicalTransaction[]>();
  for (const transaction of transactions) {
    if (transaction.kind !== "sell" || !transaction.instrumentId) continue;
    const list = sales.get(transaction.instrumentId) ?? [];
    list.push(transaction);
    sales.set(transaction.instrumentId, list);
  }
  const items: SoldLossItem[] = [];
  for (const instrument of ledger.instruments) {
    if (instrument.openQuantity > 1e-9 || withErrors.has(instrument.instrumentId)) continue;
    if (!instrument.realizedPnlComplete || instrument.realizedPnl === null || instrument.realizedPnl > -0.5) continue;
    const sold = [...(sales.get(instrument.instrumentId) ?? [])].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const soldQuantity = sold.reduce((sum, sale) => sum + (sale.quantity ?? 0), 0);
    if (soldQuantity <= 0) continue;
    const last = sold[sold.length - 1]!;
    const costOfSold =
      instrument.buyOutflows + instrument.knownOpeningBasis + instrument.costTransferredIn - instrument.costTransferredOut - (instrument.openCostBasisTotal ?? 0);
    items.push({
      instrumentId: instrument.instrumentId,
      label: labelOf(instrument.instrumentId),
      netLoss: -instrument.realizedPnl,
      soldQuantity,
      averageSalePrice: instrument.netSaleProceeds / soldQuantity,
      averageBuyPrice: costOfSold / soldQuantity,
      lastSaleDate: last.occurredAt.slice(0, 10),
      lastSalePrice: last.unitPrice ?? 0,
    });
  }
  return items.sort((a, b) => b.netLoss - a.netLoss);
}

/**
 * If the same number of shares were bought back at `priceNow`, the price they must reach
 * for this stock's overall result to be zero (the new gain cancels the booked loss).
 */
export function rebuyZeroLossPrice(priceNow: number, netLoss: number, quantity: number): number {
  return priceNow + netLoss / quantity;
}

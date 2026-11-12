import type { CanonicalTransaction } from "../domain/transaction";
import type { PnlStatement } from "../importers/zerodhaPnl";
import { buildLedger, type LedgerResult } from "./buildLedger";
import type { HoldingQuantity } from "./corporateActions";

/**
 * Checks Smartfolio's figures for every stock against Zerodha's own numbers, so the owner
 * only needs to look at stocks that don't match:
 *  - live holdings: quantity and average cost (Zerodha adjusts cost for bonuses/splits);
 *  - P&L statements (Console → Reports → P&L): realized P&L per period, and open quantity /
 *    open value (Zerodha's cost) at the end of each period.
 */
export type VerificationStatus = "verified" | "needs-answer" | "mismatch" | "unchecked";

export interface VerificationCheck {
  label: string;
  ok: boolean;
  ours: number | null;
  theirs: number | null;
  /** "money" or "quantity", for display. */
  unit: "money" | "quantity";
}

export interface StockVerification {
  instrumentId: string;
  symbol: string;
  status: VerificationStatus;
  checks: VerificationCheck[];
}

export interface VerificationResult {
  stocks: StockVerification[];
  byId: Map<string, StockVerification>;
  counts: Record<VerificationStatus, number>;
}

const QTY_EPS = 1e-6;

function moneyClose(ours: number, theirs: number, scale = 0): boolean {
  return Math.abs(ours - theirs) <= Math.max(2, Math.abs(scale) * 0.005, Math.abs(theirs) * 0.005);
}

function priceClose(ours: number, theirs: number): boolean {
  return Math.abs(ours - theirs) <= Math.max(0.05, Math.abs(theirs) * 0.005);
}

function dayOf(transaction: CanonicalTransaction): string {
  return transaction.occurredAt.slice(0, 10);
}

function realizedOf(ledger: LedgerResult, id: string): number | null {
  const item = ledger.instruments.find((instrument) => instrument.instrumentId === id);
  if (!item) return 0;
  return item.realizedPnlComplete ? item.realizedPnlKnownSubtotal : null;
}

export function verifyPortfolio(input: {
  transactions: CanonicalTransaction[];
  holdings: HoldingQuantity[] | null;
  statements: PnlStatement[];
  /** Instruments with a pending "needs your confirmation" item. */
  pendingIds: Set<string>;
  labelOf: (id: string) => string;
}): VerificationResult {
  const { transactions, holdings, statements, pendingIds, labelOf } = input;
  const checks = new Map<string, VerificationCheck[]>();
  const add = (id: string, check: VerificationCheck) => {
    const list = checks.get(id) ?? [];
    list.push(check);
    checks.set(id, list);
  };

  const ledgerNow = buildLedger(transactions);
  const now = new Map(ledgerNow.instruments.map((item) => [item.instrumentId, item]));

  // 1. Live holdings: quantity and average cost.
  for (const holding of holdings ?? []) {
    const ours = now.get(holding.isin);
    const quantity = ours?.openQuantity ?? 0;
    add(holding.isin, { label: "Shares held (vs Zerodha holdings)", ok: Math.abs(quantity - holding.quantity) < QTY_EPS, ours: quantity, theirs: holding.quantity, unit: "quantity" });
    if (holding.averagePrice && ours && ours.openQuantity > QTY_EPS && ours.openCostBasisTotal !== null && Math.abs(quantity - holding.quantity) < QTY_EPS) {
      const average = ours.openCostBasisTotal / ours.openQuantity;
      add(holding.isin, { label: "Average cost (vs Zerodha holdings)", ok: priceClose(average, holding.averagePrice), ours: average, theirs: holding.averagePrice, unit: "money" });
    }
  }
  if (holdings) {
    const held = new Set(holdings.map((holding) => holding.isin));
    for (const item of ledgerNow.instruments) {
      if (item.openQuantity > QTY_EPS && !held.has(item.instrumentId) && /^IN[A-Z0-9]{9}[0-9]$/.test(item.instrumentId)) {
        add(item.instrumentId, { label: "Shares held (vs Zerodha holdings)", ok: false, ours: item.openQuantity, theirs: 0, unit: "quantity" });
      }
    }
  }

  // 2. P&L statements: realized P&L in each period, and open quantity / cost at its end.
  for (const statement of statements) {
    if (!statement.from || !statement.to) continue;
    const upTo = buildLedger(transactions.filter((transaction) => dayOf(transaction) <= statement.to!));
    const before = buildLedger(transactions.filter((transaction) => dayOf(transaction) < statement.from!));
    const atEnd = new Map(upTo.instruments.map((item) => [item.instrumentId, item]));
    const period = `${statement.from} to ${statement.to}`;
    const covered = new Set<string>();
    for (const row of statement.rows) {
      covered.add(row.isin);
      const endRealized = realizedOf(upTo, row.isin);
      const startRealized = realizedOf(before, row.isin);
      const ours = endRealized === null || startRealized === null ? null : endRealized - startRealized;
      if (row.realized !== null && (row.realized !== 0 || (ours !== null && Math.abs(ours) > 0.5))) {
        add(row.isin, {
          label: `Booked profit/loss, ${period} (vs Zerodha P&L statement)`,
          ok: ours !== null && moneyClose(ours, row.realized, row.sellValue ?? 0),
          ours,
          theirs: row.realized,
          unit: "money",
        });
      }
      if (row.openQuantity !== null) {
        const item = atEnd.get(row.isin);
        const quantity = item?.openQuantity ?? 0;
        const sameQuantity = Math.abs(quantity - row.openQuantity) < QTY_EPS;
        add(row.isin, { label: `Shares held on ${statement.to} (vs Zerodha P&L statement)`, ok: sameQuantity, ours: quantity, theirs: row.openQuantity, unit: "quantity" });
        if (sameQuantity && row.openValue !== null && row.openQuantity > QTY_EPS) {
          const cost = item?.openCostBasisTotal ?? null;
          add(row.isin, { label: `Cost of shares held on ${statement.to} (vs Zerodha P&L statement)`, ok: cost !== null && moneyClose(cost, row.openValue), ours: cost, theirs: row.openValue, unit: "money" });
        }
      }
    }
    // Sales we have in the period that Zerodha's statement doesn't show.
    for (const item of upTo.instruments) {
      if (covered.has(item.instrumentId) || !/^IN[A-Z0-9]{9}[0-9]$/.test(item.instrumentId)) continue;
      const endRealized = realizedOf(upTo, item.instrumentId);
      const startRealized = realizedOf(before, item.instrumentId);
      if (endRealized !== null && startRealized !== null && Math.abs(endRealized - startRealized) > 2) {
        add(item.instrumentId, { label: `Booked profit/loss, ${period} (not in Zerodha P&L statement)`, ok: false, ours: endRealized - startRealized, theirs: 0, unit: "money" });
      }
    }
  }

  const ids = new Set<string>([...checks.keys(), ...pendingIds, ...ledgerNow.instruments.map((item) => item.instrumentId)]);
  const stocks: StockVerification[] = [...ids]
    .filter((id) => /^IN[A-Z0-9]{9}[0-9]$/.test(id))
    .map((id) => {
      const list = checks.get(id) ?? [];
      const status: VerificationStatus = pendingIds.has(id)
        ? "needs-answer"
        : list.some((check) => !check.ok)
          ? "mismatch"
          : list.length > 0
            ? "verified"
            : "unchecked";
      return { instrumentId: id, symbol: labelOf(id), status, checks: list };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  const counts: Record<VerificationStatus, number> = { verified: 0, "needs-answer": 0, mismatch: 0, unchecked: 0 };
  for (const stock of stocks) counts[stock.status] += 1;
  return { stocks, byId: new Map(stocks.map((stock) => [stock.instrumentId, stock])), counts };
}

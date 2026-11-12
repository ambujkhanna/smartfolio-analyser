/**
 * Compares imported-ledger open quantities with a broker holdings snapshot by ISIN.
 * The snapshot is a check only: it never creates transactions or changes P&L.
 *
 * Two average costs are reported side by side:
 * - brokerAveragePrice: what the broker shows (labelled broker-reported). It may be a
 *   fallback where history is missing, but is never used to derive realized P&L.
 * - ledgerAveragePrice: Smartfolio's own FIFO cost of the open lots, from imported history.
 */

export interface PnlPosition {
  instrumentId: string;
  openQuantity: number;
  /** Remaining FIFO cost of the open quantity; null when any lot has unknown cost. */
  openCostBasisTotal?: number | null;
  /**
   * Lifecycle figures for this instrument from the trade history. Only set when the
   * history for the instrument is complete (no missing earlier buys, all costs known).
   */
  lifecycle?: {
    /** Profit/loss already booked by sales (FIFO, after charges). */
    realizedPnl: number;
    /** Gains from profitable sales. */
    realizedGains: number;
    /** Losses from losing sales, as a positive amount. */
    realizedLosses: number;
    /** Money still in the stock: buys + opening cost + fees − sale proceeds − dividends. */
    netInvested: number;
  } | null;
}

export interface KiteHolding {
  isin?: unknown;
  tradingsymbol?: unknown;
  exchange?: unknown;
  quantity?: unknown;
  t1_quantity?: unknown;
  average_price?: unknown;
  last_price?: unknown;
}

export type ReconciliationStatus = "matched" | "quantity-mismatch" | "not-in-ledger";

export interface ReconciledHolding {
  isin: string;
  symbols: string[];
  exchanges: string[];
  brokerQuantity: number;
  ledgerQuantity: number | null;
  difference: number | null;
  status: ReconciliationStatus;
  /** Quantity-weighted broker average buy price; null when any part lacks a valid price. */
  brokerAveragePrice: number | null;
  /** brokerAveragePrice × brokerQuantity; labelled broker-reported, not ledger-derived. */
  brokerCostBasis: number | null;
  /** Average cost from the imported trade history (FIFO open lots); null when unknown or not imported. */
  ledgerAveragePrice: number | null;
  /** Broker-reported last price, labelled as such in the UI; null when absent. */
  brokerLastPrice: number | null;
  /** Lifecycle view (needs matched quantity, complete history and a last price); null otherwise. */
  lifecycle: HoldingLifecycle | null;
}

export interface HoldingLifecycle {
  /** Profit/loss already booked on this stock (net). */
  realizedPnl: number;
  /** Profit booked by profitable sales. */
  profitBooked: number;
  /** Loss booked by losing sales, as a positive amount. */
  lossBooked: number;
  /**
   * How much of the booked loss has been made back by booked profits and the current
   * gain on shares held (0 … lossBooked). lossCovered + toRecover = lossBooked when the
   * current holding is not itself at a loss beyond that.
   */
  lossCovered: number;
  /** Profit/loss on the shares still held, against your real (FIFO) cost. */
  unrealizedPnl: number;
  /** Booked + unrealized (+ dividends − fees): current value minus money still in. */
  overallPnl: number;
  /** Money still in the stock after everything you sold. */
  netInvested: number;
  /** Amount still needed to get all your money back at today's price; 0 when already recovered. */
  toRecover: number;
  /** Price at which selling everything held returns all the money put in. */
  breakEvenPrice: number;
}

export interface HoldingsReconciliation {
  rows: ReconciledHolding[];
  unmatchedLedger: PnlPosition[];
}

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positivePrice(value: unknown): number | null {
  const price = finiteNumber(value);
  return price !== null && price > 0 ? price : null;
}

export function isinFromInstrumentId(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (ISIN_PATTERN.test(normalized)) return normalized;
  const qualified = normalized.match(/^(?:NSE|BSE):([A-Z]{2}[A-Z0-9]{9}[0-9])$/);
  return qualified?.[1] ?? null;
}

interface HoldingGroup {
  symbols: Set<string>;
  exchanges: Set<string>;
  quantity: number;
  costTotal: number;
  costKnown: boolean;
  lastPrice: number | null;
}

interface LedgerGroup {
  quantity: number;
  cost: number;
  costKnown: boolean;
  positions: PnlPosition[];
  realizedPnl: number;
  realizedGains: number;
  realizedLosses: number;
  netInvested: number;
  lifecycleKnown: boolean;
}

function lifecycleFor(ledger: LedgerGroup, brokerQuantity: number, lastPrice: number | null): HoldingLifecycle | null {
  if (!ledger.lifecycleKnown || !ledger.costKnown || lastPrice === null || ledger.quantity <= 0) return null;
  if (Math.abs(brokerQuantity - ledger.quantity) >= 0.000001) return null;
  const marketValue = lastPrice * ledger.quantity;
  const overallPnl = marketValue - ledger.netInvested;
  const unrealizedPnl = marketValue - ledger.cost;
  return {
    realizedPnl: ledger.realizedPnl,
    profitBooked: ledger.realizedGains,
    lossBooked: ledger.realizedLosses,
    lossCovered: Math.min(ledger.realizedLosses, Math.max(0, ledger.realizedGains + unrealizedPnl)),
    unrealizedPnl,
    overallPnl,
    netInvested: ledger.netInvested,
    toRecover: Math.max(0, -overallPnl),
    breakEvenPrice: ledger.netInvested / ledger.quantity,
  };
}

function average(total: number, quantity: number, known: boolean): number | null {
  return known && quantity > 0 ? total / quantity : null;
}

export function reconcileHoldings(holdings: KiteHolding[], positions: PnlPosition[]): HoldingsReconciliation {
  // Aggregate ledger positions by ISIN because the same security can appear under
  // multiple exchange-qualified instrument IDs while Zerodha holdings are grouped by ISIN.
  const ledgerByIsin = new Map<string, LedgerGroup>();
  const positionsWithoutIsin: PnlPosition[] = [];
  for (const position of positions.filter((item) => item.openQuantity > 0)) {
    const isin = isinFromInstrumentId(position.instrumentId);
    if (!isin) {
      positionsWithoutIsin.push(position);
      continue;
    }
    const group = ledgerByIsin.get(isin) ?? {
      quantity: 0,
      cost: 0,
      costKnown: true,
      positions: [],
      realizedPnl: 0,
      realizedGains: 0,
      realizedLosses: 0,
      netInvested: 0,
      lifecycleKnown: true,
    };
    if (position.lifecycle) {
      group.realizedPnl += position.lifecycle.realizedPnl;
      group.realizedGains += position.lifecycle.realizedGains;
      group.realizedLosses += position.lifecycle.realizedLosses;
      group.netInvested += position.lifecycle.netInvested;
    } else {
      group.lifecycleKnown = false;
    }
    group.quantity += position.openQuantity;
    const cost = position.openCostBasisTotal;
    if (typeof cost === "number" && Number.isFinite(cost)) group.cost += cost;
    else group.costKnown = false;
    group.positions.push(position);
    ledgerByIsin.set(isin, group);
  }

  const holdingsByIsin = new Map<string, HoldingGroup>();
  const notIdentifiable: ReconciledHolding[] = [];

  for (const holding of holdings) {
    const isin = text(holding.isin).toUpperCase();
    const quantity = finiteNumber(holding.quantity);
    const t1Quantity = finiteNumber(holding.t1_quantity) ?? 0;
    if (!ISIN_PATTERN.test(isin) || quantity === null) {
      notIdentifiable.push({
        isin: isin || "Unavailable ISIN",
        symbols: text(holding.tradingsymbol) ? [text(holding.tradingsymbol)] : [],
        exchanges: text(holding.exchange) ? [text(holding.exchange)] : [],
        brokerQuantity: quantity ?? 0,
        ledgerQuantity: null,
        difference: null,
        status: "not-in-ledger",
        brokerAveragePrice: null,
        brokerCostBasis: null,
        ledgerAveragePrice: null,
        brokerLastPrice: positivePrice(holding.last_price),
        lifecycle: null,
      });
      continue;
    }
    const group = holdingsByIsin.get(isin) ?? {
      symbols: new Set<string>(),
      exchanges: new Set<string>(),
      quantity: 0,
      costTotal: 0,
      costKnown: true,
      lastPrice: null,
    };
    const symbol = text(holding.tradingsymbol);
    const exchange = text(holding.exchange);
    if (symbol) group.symbols.add(symbol);
    if (exchange) group.exchanges.add(exchange);
    const totalQuantity = quantity + t1Quantity;
    const averagePrice = positivePrice(holding.average_price);
    if (totalQuantity > 0) {
      if (averagePrice === null) group.costKnown = false;
      else group.costTotal += averagePrice * totalQuantity;
    }
    group.lastPrice ??= positivePrice(holding.last_price);
    group.quantity += totalQuantity;
    holdingsByIsin.set(isin, group);
  }

  const rows: ReconciledHolding[] = [];
  const matchedIsins = new Set<string>();
  for (const [isin, holding] of holdingsByIsin) {
    const ledger = ledgerByIsin.get(isin);
    const brokerAveragePrice = average(holding.costTotal, holding.quantity, holding.costKnown);
    const base = {
      isin,
      symbols: [...holding.symbols],
      exchanges: [...holding.exchanges],
      brokerQuantity: holding.quantity,
      brokerAveragePrice,
      brokerCostBasis: brokerAveragePrice === null ? null : holding.costTotal,
      brokerLastPrice: holding.lastPrice,
    };
    if (!ledger) {
      rows.push({ ...base, ledgerQuantity: null, difference: null, status: "not-in-ledger", ledgerAveragePrice: null, lifecycle: null });
      continue;
    }
    const difference = holding.quantity - ledger.quantity;
    matchedIsins.add(isin);
    rows.push({
      ...base,
      ledgerQuantity: ledger.quantity,
      difference,
      status: Math.abs(difference) < 0.000001 ? "matched" : "quantity-mismatch",
      ledgerAveragePrice: average(ledger.cost, ledger.quantity, ledger.costKnown),
      lifecycle: lifecycleFor(ledger, holding.quantity, holding.lastPrice),
    });
  }

  rows.push(...notIdentifiable);
  const unmatchedLedger = positionsWithoutIsin.concat(
    [...ledgerByIsin.entries()]
      .filter(([isin]) => !matchedIsins.has(isin))
      .flatMap(([, ledger]) => ledger.positions),
  );
  return { rows, unmatchedLedger };
}

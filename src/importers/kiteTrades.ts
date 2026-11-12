import { validateTransaction, type CanonicalTransaction } from "../domain/transaction";

/**
 * Converts Zerodha Kite "trades" (today's executed trades) into the same canonical
 * transactions the tradebook importer produces, with the same ID scheme
 * (EXCHANGE:YYYY-MM-DD:tradeId), so a later tradebook upload of the same day is
 * recognised as the same trades and not counted twice.
 */
export interface KiteTrade {
  trade_id?: unknown;
  exchange?: unknown;
  tradingsymbol?: unknown;
  transaction_type?: unknown;
  quantity?: unknown;
  average_price?: unknown;
  fill_timestamp?: unknown;
  exchange_timestamp?: unknown;
  order_timestamp?: unknown;
}

export const KITE_TRADES_SOURCE = "Zerodha (daily trades)";

/** Exchange trade IDs are numeric; spreadsheets drop leading zeros, so compare without them. */
export function normalizeTradeId(value: string): string {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed.replace(/^0+(?=\d)/, "") : trimmed;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function timestamp(trade: KiteTrade): { date: string; occurredAt: string } | null {
  for (const candidate of [trade.fill_timestamp, trade.exchange_timestamp, trade.order_timestamp]) {
    const match = text(candidate).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
    if (match) return { date: match[1]!, occurredAt: `${match[1]}T${match[2]}+05:30` };
  }
  return null;
}

export interface KiteConversion {
  transactions: CanonicalTransaction[];
  /** NSE/BSE equity symbols whose ISIN is not known yet (resolve, then convert again). */
  unknownSymbols: Array<{ symbol: string; exchange: string }>;
  skipped: number;
}

export function kiteTradesToTransactions(trades: unknown[], isinBySymbol: Map<string, string>): KiteConversion {
  const transactions: CanonicalTransaction[] = [];
  const unknown = new Map<string, { symbol: string; exchange: string }>();
  let skipped = 0;
  trades.forEach((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      skipped += 1;
      return;
    }
    const trade = raw as KiteTrade;
    const exchange = text(trade.exchange).toUpperCase();
    const symbol = text(trade.tradingsymbol).toUpperCase();
    const side = text(trade.transaction_type).toUpperCase();
    const tradeId = normalizeTradeId(text(trade.trade_id));
    const when = timestamp(trade);
    // Only cash equity on NSE/BSE, matching the Equity tradebook.
    if (!["NSE", "BSE"].includes(exchange) || !["BUY", "SELL"].includes(side) || !tradeId || !symbol || !when) {
      skipped += 1;
      return;
    }
    const isin = isinBySymbol.get(symbol);
    if (!isin) {
      unknown.set(`${exchange}:${symbol}`, { symbol, exchange });
      return;
    }
    const validation = validateTransaction({
      transactionId: `${exchange}:${when.date}:${tradeId}`,
      kind: side === "BUY" ? "buy" : "sell",
      instrumentId: isin,
      symbol,
      occurredAt: when.occurredAt,
      currency: "INR",
      quantity: trade.quantity,
      unitPrice: trade.average_price,
      source: { fileName: KITE_TRADES_SOURCE, rowNumber: index + 1 },
    });
    if (validation.status === "valid") transactions.push(validation.transaction);
    else skipped += 1;
  });
  return { transactions, unknownSymbols: [...unknown.values()], skipped };
}

"use client";

import { useState } from "react";

interface PnlPosition {
  instrumentId: string;
  openQuantity: number;
}

interface KiteHolding {
  isin?: unknown;
  tradingsymbol?: unknown;
  exchange?: unknown;
  quantity?: unknown;
  t1_quantity?: unknown;
}

interface HoldingsResponse {
  data?: unknown;
  error?: string;
  retrievedAt?: string;
}

interface ReconciledHolding {
  isin: string;
  symbols: string[];
  exchanges: string[];
  brokerQuantity: number;
  ledgerQuantity: number | null;
  difference: number | null;
  status: "matched" | "quantity-mismatch" | "not-in-ledger";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isinFromInstrumentId(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(normalized)) return normalized;
  const qualified = normalized.match(/^(?:NSE|BSE):([A-Z]{2}[A-Z0-9]{9}[0-9])$/);
  return qualified?.[1] ?? null;
}

function reconcile(
  holdings: KiteHolding[],
  positions: PnlPosition[],
): { rows: ReconciledHolding[]; unmatchedLedger: PnlPosition[] } {
  // Aggregate ledger positions by ISIN because the same security can appear under
  // multiple exchange-qualified instrument IDs while Zerodha holdings are grouped by ISIN.
  const ledgerByIsin = new Map<string, { quantity: number; positions: PnlPosition[] }>();
  const positionsWithoutIsin: PnlPosition[] = [];
  for (const position of positions.filter((item) => item.openQuantity > 0)) {
    const isin = isinFromInstrumentId(position.instrumentId);
    if (!isin) {
      positionsWithoutIsin.push(position);
      continue;
    }
    const group = ledgerByIsin.get(isin) ?? { quantity: 0, positions: [] };
    group.quantity += position.openQuantity;
    group.positions.push(position);
    ledgerByIsin.set(isin, group);
  }

  const holdingsByIsin = new Map<string, { symbols: Set<string>; exchanges: Set<string>; quantity: number }>();
  const notIdentifiable: ReconciledHolding[] = [];

  for (const holding of holdings) {
    const isin = text(holding.isin).toUpperCase();
    const quantity = finiteQuantity(holding.quantity);
    const t1Quantity = finiteQuantity(holding.t1_quantity) ?? 0;
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin) || quantity === null) {
      notIdentifiable.push({
        isin: isin || "Unavailable ISIN",
        symbols: text(holding.tradingsymbol) ? [text(holding.tradingsymbol)] : [],
        exchanges: text(holding.exchange) ? [text(holding.exchange)] : [],
        brokerQuantity: quantity ?? 0,
        ledgerQuantity: null,
        difference: null,
        status: "not-in-ledger",
      });
      continue;
    }
    const group = holdingsByIsin.get(isin) ?? { symbols: new Set<string>(), exchanges: new Set<string>(), quantity: 0 };
    const symbol = text(holding.tradingsymbol);
    const exchange = text(holding.exchange);
    if (symbol) group.symbols.add(symbol);
    if (exchange) group.exchanges.add(exchange);
    group.quantity += quantity + t1Quantity;
    holdingsByIsin.set(isin, group);
  }

  const rows: ReconciledHolding[] = [];
  const matchedIsins = new Set<string>();
  for (const [isin, holding] of holdingsByIsin) {
    const ledger = ledgerByIsin.get(isin);
    if (!ledger) {
      rows.push({
        isin,
        symbols: [...holding.symbols],
        exchanges: [...holding.exchanges],
        brokerQuantity: holding.quantity,
        ledgerQuantity: null,
        difference: null,
        status: "not-in-ledger",
      });
      continue;
    }
    const difference = holding.quantity - ledger.quantity;
    matchedIsins.add(isin);
    rows.push({
      isin,
      symbols: [...holding.symbols],
      exchanges: [...holding.exchanges],
      brokerQuantity: holding.quantity,
      ledgerQuantity: ledger.quantity,
      difference,
      status: Math.abs(difference) < 0.000001 ? "matched" : "quantity-mismatch",
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

export default function ZerodhaHoldingsReconciliation({ positions }: { positions: PnlPosition[] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnType<typeof reconcile> | null>(null);
  const [retrievedAt, setRetrievedAt] = useState<string | null>(null);

  async function handleReconcile() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/zerodha/data?type=holdings", { cache: "no-store" });
      const payload = (await response.json()) as HoldingsResponse;
      if (!response.ok) throw new Error(payload.error || "Unable to fetch Zerodha holdings.");
      const kiteData = payload.data as { data?: unknown } | undefined;
      if (!kiteData || !Array.isArray(kiteData.data)) {
        throw new Error("Zerodha returned an unexpected holdings response.");
      }
      setResult(reconcile(kiteData.data as KiteHolding[], positions));
      setRetrievedAt(payload.retrievedAt ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Holdings reconciliation failed. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  const quantityFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });
  const matchedCount = result?.rows.filter((row) => row.status === "matched").length ?? 0;
  const mismatchCount = result?.rows.filter((row) => row.status === "quantity-mismatch").length ?? 0;

  return (
    <section className="quote-access-panel" aria-labelledby="holdings-reconciliation-title">
      <div>
        <strong id="holdings-reconciliation-title">Reconcile open quantities with Zerodha</strong>
        <p>Compares imported-ledger open quantities with current broker holdings by exact ISIN. This is a check only: broker snapshots are not added as transactions and do not change P&amp;L.</p>
      </div>
      <button type="button" className="secondary-action-button" onClick={() => void handleReconcile()} disabled={loading}>
        {loading ? "Reconciling…" : "Reconcile holdings"}
      </button>
      {error ? <p className="import-error" role="alert">{error}</p> : null}
      {result ? (
        <div className="import-results" aria-live="polite">
          <div className="resolution-summary">
            <span><strong>{matchedCount}</strong> quantities match</span>
            <span><strong>{mismatchCount}</strong> quantity mismatches</span>
            <span><strong>{result.rows.filter((row) => row.status === "not-in-ledger").length}</strong> holdings not matched</span>
            {retrievedAt ? <small>Broker snapshot retrieved at {new Date(retrievedAt).toLocaleString()}</small> : null}
          </div>
          <p className="import-safety-note">A mismatch can mean the imported trade history is incomplete, the import date range differs, or an instrument lacks a unique ISIN mapping. Review before using the ledger as complete.</p>
          {result.rows.length > 0 || result.unmatchedLedger.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Instrument</th><th>ISIN</th><th>Zerodha qty</th><th>Ledger qty</th><th>Difference</th><th>Status</th></tr></thead>
                <tbody>
                  {result.rows.map((row, index) => (
                    <tr key={row.isin + ":" + index}>
                      <td>{row.symbols.join(", ") || "—"}{row.exchanges.length ? " (" + row.exchanges.join(", ") + ")" : ""}</td>
                      <td>{row.isin}</td>
                      <td>{quantityFormat.format(row.brokerQuantity)}</td>
                      <td>{row.ledgerQuantity === null ? "—" : quantityFormat.format(row.ledgerQuantity)}</td>
                      <td>{row.difference === null ? "—" : quantityFormat.format(row.difference)}</td>
                      <td>{row.status === "matched" ? "Matched" : row.status === "quantity-mismatch" ? "Quantity mismatch" : "Not matched by ISIN"}</td>
                    </tr>
                  ))}
                  {result.unmatchedLedger.map((position) => (
                    <tr key={"ledger:" + position.instrumentId}>
                      <td>—</td><td>{position.instrumentId}</td><td>—</td>
                      <td>{quantityFormat.format(position.openQuantity)}</td><td>—</td><td>Open ledger position not found in broker holdings</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No current holdings were returned by Zerodha.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

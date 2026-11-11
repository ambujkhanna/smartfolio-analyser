"use client";

import { useState } from "react";
import {
  reconcileHoldings,
  type HoldingsReconciliation,
  type KiteHolding,
  type PnlPosition,
} from "../engine/reconcileHoldings";

interface HoldingsResponse {
  data?: unknown;
  error?: string;
  retrievedAt?: string;
}

export default function ZerodhaHoldingsReconciliation({ positions }: { positions: PnlPosition[] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HoldingsReconciliation | null>(null);
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
      setResult(reconcileHoldings(kiteData.data as KiteHolding[], positions));
      setRetrievedAt(payload.retrievedAt ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Holdings reconciliation failed. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  const quantityFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });
  const moneyFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
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
          <p className="import-safety-note">&ldquo;Broker avg cost&rdquo; is Zerodha&rsquo;s reported average buy price. It is shown for reference where your imported history is incomplete and is never used to calculate realized P&amp;L.</p>
          {result.rows.length > 0 || result.unmatchedLedger.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Instrument</th><th>ISIN</th><th>Zerodha qty</th><th>Ledger qty</th><th>Difference</th><th>Broker avg cost</th><th>Status</th></tr></thead>
                <tbody>
                  {result.rows.map((row, index) => (
                    <tr key={row.isin + ":" + index}>
                      <td>{row.symbols.join(", ") || "—"}{row.exchanges.length ? " (" + row.exchanges.join(", ") + ")" : ""}</td>
                      <td>{row.isin}</td>
                      <td>{quantityFormat.format(row.brokerQuantity)}</td>
                      <td>{row.ledgerQuantity === null ? "—" : quantityFormat.format(row.ledgerQuantity)}</td>
                      <td>{row.difference === null ? "—" : quantityFormat.format(row.difference)}</td>
                      <td title={row.brokerCostBasis === null ? undefined : `Broker-reported cost basis ${moneyFormat.format(row.brokerCostBasis)}`}>
                        {row.brokerAveragePrice === null ? "Unavailable" : moneyFormat.format(row.brokerAveragePrice)}
                      </td>
                      <td>{row.status === "matched" ? "Matched" : row.status === "quantity-mismatch" ? "Quantity mismatch" : "Not matched by ISIN"}</td>
                    </tr>
                  ))}
                  {result.unmatchedLedger.map((position) => (
                    <tr key={"ledger:" + position.instrumentId}>
                      <td>—</td><td>{position.instrumentId}</td><td>—</td>
                      <td>{quantityFormat.format(position.openQuantity)}</td><td>—</td><td>—</td><td>Open ledger position not found in broker holdings</td>
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

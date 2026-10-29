"use client";

import { useState, type ChangeEvent } from "react";
import { buildLedger, type LedgerResult } from "../engine/buildLedger";
import { calculatePortfolioPnL, type PortfolioPnL } from "../engine/calculatePortfolioPnL";
import { parseGenericCsv, type GenericCsvImportResult } from "../importers/genericCsv";
import { formatINR } from "../lib/formatMoney";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 50;

interface AnalysisSnapshot {
  ledger: LedgerResult;
  pnl: PortfolioPnL;
  importIssueCount: number;
  sourceRowCount: number;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(value);
}

export default function ImportReview() {
  const [result, setResult] = useState<GenericCsvImportResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setResult(null);
    setAnalysis(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a CSV file. Other file formats are not supported yet.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("This file is larger than 5 MB. Split it into smaller CSV files and try again.");
      event.target.value = "";
      return;
    }

    setIsReading(true);
    try {
      const text = await file.text();
      setResult(parseGenericCsv(text, file.name));
    } catch {
      setError("The file could not be read. Check that it is a valid text CSV and try again.");
    } finally {
      setIsReading(false);
    }
  }

  function handleCalculateAcceptedRows() {
    if (!result || result.transactions.length === 0) return;
    const ledger = buildLedger(result.transactions);
    const pnl = calculatePortfolioPnL(ledger, {});
    setAnalysis({
      ledger,
      pnl,
      importIssueCount: result.issues.length,
      sourceRowCount: result.rowCount,
    });
  }

  const previewRows = result?.rows.slice(0, PREVIEW_ROW_LIMIT) ?? [];
  const openPositions = analysis?.pnl.instrumentMetrics.filter((item) => item.openQuantity > 0) ?? [];
  const hasMissingQuotes = openPositions.some((item) => item.marketValue === null);

  return (
    <section className="import-review" aria-labelledby="import-title">
      <div className="import-heading">
        <div>
          <p className="eyebrow">Step 1 · Review your data</p>
          <h2 id="import-title">Preview a tradebook CSV</h2>
          <p className="import-description">
            The file is parsed in your browser. Invalid rows and rows needing instrument resolution stay visible and are not passed to calculations.
          </p>
        </div>
        <span className="file-limit">CSV · up to 5 MB</span>
      </div>

      <label className="file-picker" htmlFor="tradebook-file">
        <span className="file-picker-icon" aria-hidden="true">↑</span>
        <span>
          <strong>{isReading ? "Reading file…" : "Choose a CSV file"}</strong>
          <small>Nothing is uploaded to a server in this preview step.</small>
        </span>
        <input
          id="tradebook-file"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          disabled={isReading}
        />
      </label>

      {error ? <p className="import-error" role="alert">{error}</p> : null}

      {result ? (
        <div className="import-results" aria-live="polite">
          <div className="import-summary">
            <div className="import-summary-title">
              <strong>{result.fileName}</strong>
              <span>{result.isComplete ? "No validation issues" : "Review needed"}</span>
            </div>
            <div className="import-stats">
              <div><strong>{result.rowCount}</strong><span>Data rows</span></div>
              <div><strong>{result.acceptedCount}</strong><span>Accepted</span></div>
              <div><strong>{result.rejectedCount}</strong><span>Needs attention</span></div>
            </div>
            <p className="import-safety-note">
              Preview only: no transactions have been saved. Analysis below uses accepted rows only and does not fetch market prices.
            </p>
          </div>

          {result.issues.length > 0 ? (
            <div className="issue-banner">
              <strong>{result.issues.length} issue{result.issues.length === 1 ? "" : "s"} found</strong>
              <p>Invalid or unresolved rows are excluded from calculations. Results based on the remaining rows are partial.</p>
            </div>
          ) : null}

          <div className="calculate-action">
            <div>
              <strong>Calculate from accepted rows</strong>
              <p>Calculations run locally in your browser. Open-position market values stay unavailable until a validated quote is connected.</p>
            </div>
            <button
              type="button"
              className="calculate-button"
              onClick={handleCalculateAcceptedRows}
              disabled={isReading || result.transactions.length === 0}
            >
              Calculate P&amp;L
            </button>
          </div>

          {analysis ? (
            <section className="analysis-panel" aria-labelledby="analysis-title">
              <div className="analysis-heading">
                <div>
                  <p className="eyebrow">Accepted transactions · {analysis.pnl.instrumentMetrics.length} instruments</p>
                  <h3 id="analysis-title">Portfolio calculation preview</h3>
                </div>
                <span className={"analysis-status " + (analysis.pnl.isComplete && analysis.importIssueCount === 0 ? "analysis-status-complete" : "analysis-status-partial")}>
                  {analysis.pnl.isComplete && analysis.importIssueCount === 0 ? "Complete for supplied data" : "Partial / needs attention"}
                </span>
              </div>

              {analysis.importIssueCount > 0 ? (
                <p className="analysis-warning">
                  This calculation uses {result.acceptedCount} accepted rows out of {analysis.sourceRowCount}. Fix the {analysis.importIssueCount} import issue(s) before relying on totals.
                </p>
              ) : null}

              {hasMissingQuotes ? (
                <p className="analysis-warning">
                  No validated market quote was supplied for one or more open positions. Their market value and unrealized P&amp;L, and the portfolio economic P&amp;L, remain unavailable. No price has been guessed.
                </p>
              ) : null}

              <div className="pnl-stats">
                <div><span>Realized P&amp;L</span><strong>{formatINR(analysis.pnl.realizedPnl)}</strong></div>
                <div><span>Unrealized P&amp;L</span><strong>{formatINR(analysis.pnl.unrealizedPnl)}</strong></div>
                <div><span>Market value</span><strong>{formatINR(analysis.pnl.marketValue)}</strong></div>
                <div><span>Economic P&amp;L</span><strong>{formatINR(analysis.pnl.economicPnl)}</strong></div>
              </div>

              <div className="position-table-wrap">
                <table className="position-table">
                  <thead>
                    <tr>
                      <th scope="col">Instrument ID</th>
                      <th scope="col">Open qty</th>
                      <th scope="col">Cost basis</th>
                      <th scope="col">Market value</th>
                      <th scope="col">Unrealized P&amp;L</th>
                      <th scope="col">Position break-even</th>
                      <th scope="col">Lifecycle recovery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.pnl.instrumentMetrics.map((item) => (
                      <tr key={item.instrumentId}>
                        <td>
                          <strong>{item.instrumentId}</strong>
                          {item.reason ? <small className="position-reason">{item.reason}</small> : null}
                        </td>
                        <td>{formatQuantity(item.openQuantity)}</td>
                        <td>{formatINR(item.openCostBasisTotal)}</td>
                        <td>{formatINR(item.marketValue)}</td>
                        <td>{formatINR(item.unrealizedPnl)}</td>
                        <td>{item.positionBreakEvenPrice === null ? "Not applicable" : formatINR(item.positionBreakEvenPrice)}</td>
                        <td>{item.lifecycleRecoveryPrice === null ? "Unavailable" : formatINR(item.lifecycleRecoveryPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {analysis.ledger.errors.length > 0 ? (
                <div className="analysis-issues">
                  <strong>Errors — rows were not applied</strong>
                  <ul>
                    {analysis.ledger.errors.map((issue, index) => (
                      <li key={issue.code + "-" + (issue.transactionId ?? "") + "-" + index}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {analysis.ledger.warnings.length > 0 ? (
                <div className="analysis-issues">
                  <strong>Warnings</strong>
                  <ul>
                    {analysis.ledger.warnings.map((issue, index) => (
                      <li key={issue.code + "-" + (issue.transactionId ?? "") + "-" + index}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="import-safety-note">
                This is an in-memory calculation preview, not a saved portfolio. FIFO is the initial cost-allocation convention; this is not tax advice or a tax report.
              </p>
            </section>
          ) : null}

          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Status</th>
                  <th scope="col">Transaction</th>
                  <th scope="col">Source data / issues</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>
                      <span className={"row-status row-status-" + row.status}>
                        {row.status === "valid"
                          ? "Valid"
                          : row.status === "needs-resolution"
                            ? "Resolve instrument"
                            : "Invalid"}
                      </span>
                    </td>
                    <td>
                      {row.transaction ? (
                        <div className="transaction-preview">
                          <strong>{row.transaction.kind}</strong>
                          <span>{row.transaction.instrumentId ?? "Portfolio-level"}</span>
                          {row.transaction.quantity !== undefined ? <span>Qty: {row.transaction.quantity}</span> : null}
                          {row.transaction.unitPrice !== undefined ? <span>Price: {row.transaction.unitPrice}</span> : null}
                          {row.transaction.amount !== undefined ? <span>Amount: {row.transaction.amount}</span> : null}
                        </div>
                      ) : "Not accepted"}
                    </td>
                    <td>
                      <details>
                        <summary>View original row and {row.issues.length} issue{row.issues.length === 1 ? "" : "s"}</summary>
                        <code className="raw-row">
                          {row.rawValues.map((value, index) => `${result.headers[index] ?? "Column " + (index + 1)}: ${value || "(empty)"}`).join(" · ")}
                        </code>
                        {row.issues.length > 0 ? (
                          <ul className="row-issues">
                            {row.issues.map((issue, index) => (
                              <li key={issue.code + "-" + (issue.field ?? "") + "-" + index}>
                                {issue.field ? <strong>{issue.field}: </strong> : null}{issue.message}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.rows.length > PREVIEW_ROW_LIMIT ? (
            <p className="preview-limit-note">
              Showing the first {PREVIEW_ROW_LIMIT} rows. All {result.rows.length} rows were parsed for this preview.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

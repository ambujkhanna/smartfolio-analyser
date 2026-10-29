"use client";

import { useState, type ChangeEvent } from "react";
import { parseGenericCsv, type GenericCsvImportResult } from "../importers/genericCsv";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 50;

export default function ImportReview() {
  const [result, setResult] = useState<GenericCsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setResult(null);
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

  const previewRows = result?.rows.slice(0, PREVIEW_ROW_LIMIT) ?? [];

  return (
    <section className="import-review" aria-labelledby="import-title">
      <div className="import-heading">
        <div>
          <p className="eyebrow">Step 1 · Review your data</p>
          <h2 id="import-title">Preview a tradebook CSV</h2>
          <p className="import-description">
            The file is parsed in your browser. Rows that are invalid or need instrument resolution stay visible and are not sent to the accounting engine.
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
              Preview only: no transactions have been saved, and no portfolio P&amp;L has been calculated.
            </p>
          </div>

          {result.issues.length > 0 ? (
            <div className="issue-banner">
              <strong>{result.issues.length} issue{result.issues.length === 1 ? "" : "s"} found</strong>
              <p>Fix the source data or resolve instrument identities before these rows can be used.</p>
            </div>
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

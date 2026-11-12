"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import {
  type InstrumentReference,
  type InstrumentResolution,
} from "../domain/instrument";
import { validateTransaction } from "../domain/transaction";
import { buildLedger, type LedgerResult } from "../engine/buildLedger";
import { calculatePortfolioPnL, type PortfolioPnL } from "../engine/calculatePortfolioPnL";
import { buildPositionValuations } from "../engine/quoteValuations";
import { parseGenericCsv, type CsvPreviewRow, type GenericCsvImportResult } from "../importers/genericCsv";
import { importProgress } from "../lib/importProgress";
import { xlsxTransactionTable, XlsxReadError } from "../importers/xlsx";
import { parseZerodhaTradebook } from "../importers/zerodhaTradebook";
import { formatINR } from "../lib/formatMoney";
import type { QuoteValidation } from "../domain/quote";
import ZerodhaHoldingsReconciliation from "./ZerodhaHoldingsReconciliation";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const PREVIEW_ROW_LIMIT = 50;
const RESOLUTION_BATCH_SIZE = 100;

interface AnalysisSnapshot {
  ledger: LedgerResult;
  pnl: PortfolioPnL;
  importIssueCount: number;
  sourceRowCount: number;
}

interface ResolutionResponse {
  results?: Array<{ index: number; resolution: InstrumentResolution }>;
  masterRetrievedAt?: string;
  error?: string;
}

interface QuoteResponse {
  quotes?: Array<{ index: number; instrumentId: string; result: QuoteValidation }>;
  retrievedAt?: string;
  error?: string;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(value);
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rawValue(row: CsvPreviewRow, aliases: string[]): string | undefined {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  const entry = Object.entries(row.raw).find(([header]) => normalizedizedHeader(header, normalizedAliases));
  return entry?.[1]?.trim() || undefined;
}

function normalizedizedHeader(header: string, aliases: Set<string>): boolean {
  return aliases.has(normalizeHeader(header));
}

function referenceForRow(row: CsvPreviewRow): InstrumentReference | null {
  const transaction = row.transaction ?? row.candidateTransaction;
  if (!transaction) return null;

  const rawInstrumentId = transaction.instrumentId;
  const instrumentId = rawInstrumentId?.startsWith("SYMBOL:") ? undefined : rawInstrumentId;
  const isin = rawValue(row, ["isin"]);
  const amfiSchemeCode = rawValue(row, ["amfiSchemeCode", "schemeCode", "amfiCode"]);
  const symbol = rawValue(row, ["symbol", "ticker", "tradingSymbol", "scrip", "security", "schemeName", "fundName"]);
  const exchangeValue = rawValue(row, ["exchange", "stockExchange", "exchangeSegment"])?.toUpperCase();
  const exchange =
    exchangeValue === "NSE" || exchangeValue === "NSE_EQ"
      ? "NSE"
      : exchangeValue === "BSE" || exchangeValue === "BSE_EQ"
        ? "BSE"
        : undefined;
  const assetValue = rawValue(row, ["assetType", "instrumentType"])?.toLowerCase().replace(/[\\s_]/g, "-");
  const assetType =
    assetValue === "equity" || assetValue === "stock" || assetValue === "share" || assetValue === "shares" || assetValue === "eq"
      ? "equity"
      : assetValue === "etf" || assetValue === "exchange-traded-fund"
        ? "etf"
        : assetValue === "mutual-fund" || assetValue === "mutualfund" || assetValue === "mf"
          ? "mutual-fund"
          : assetValue === "other"
            ? "other"
            : amfiSchemeCode
              ? "mutual-fund"
              : undefined;

  if (!instrumentId && !isin && !symbol && !amfiSchemeCode) return null;
  return {
    ...(instrumentId ? { instrumentId } : {}),
    ...(isin ? { isin } : {}),
    ...(amfiSchemeCode ? { amfiSchemeCode } : {}),
    ...(symbol ? { symbol } : {}),
    ...(exchange ? { exchange } : {}),
    ...(assetType ? { assetType } : {}),
  };
}

/** Reads one tradebook file; returns the parsed result or a plain-language error. */
async function readTradebookFile(file: File): Promise<GenericCsvImportResult | string> {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (!["csv", "txt", "xlsx"].includes(extension)) {
    const message = ["xls", "pdf"].includes(extension)
      ? extension === "xls"
        ? "Old .xls workbooks are not supported. Open the file in Excel and save it as .xlsx or CSV."
        : "PDF files are not supported yet."
      : "This file format is not supported.";
    return message + " Upload a Zerodha tradebook as .xlsx or .csv.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) return "This file is larger than 5 MB. Split it into smaller files and try again.";
  try {
    if (extension === "xlsx") {
      const table = xlsxTransactionTable(new Uint8Array(await file.arrayBuffer()));
      if (!table) {
        return "No transaction table was found in this workbook. Expected a header row with columns such as Symbol, ISIN, Trade Date, Trade Type, Quantity, Price and Trade ID.";
      }
      return parseZerodhaTradebook(table.csvText, file.name) ?? parseGenericCsv(table.csvText, file.name);
    }
    const text = await file.text();
    if (!text.trim()) return "The selected file is empty.";
    if (text.includes("\u0000")) return "This file appears to contain binary data, not delimited text.";
    return parseZerodhaTradebook(text, file.name) ?? parseGenericCsv(text, file.name);
  } catch (readFailure) {
    return readFailure instanceof XlsxReadError
      ? readFailure.message + " Re-download the file from Zerodha Console or save it as CSV."
      : "The file could not be read. Check that it is a valid CSV, TXT or XLSX file and try again.";
  }
}

/**
 * Combines several tradebook files (e.g. one per year). Row numbers are renumbered so
 * they stay unique on screen; each transaction keeps its own file name and row as its
 * source. Trades present in more than one file share an ID and are merged by the ledger.
 */
export function mergeImportResults(results: GenericCsvImportResult[]): GenericCsvImportResult {
  if (results.length === 1) return results[0]!;
  let offset = 0;
  const rows: CsvPreviewRow[] = [];
  const issues: GenericCsvImportResult["issues"] = [];
  const shift = <T extends { rowNumber?: number }>(issue: T): T =>
    issue.rowNumber === undefined ? issue : { ...issue, rowNumber: issue.rowNumber + offset };
  for (const item of results) {
    const maxRow = item.rows.reduce((max, row) => Math.max(max, row.rowNumber), 0);
    rows.push(...item.rows.map((row) => ({ ...row, rowNumber: row.rowNumber + offset, issues: row.issues.map(shift) })));
    issues.push(...item.issues.map(shift));
    offset += maxRow + 1;
  }
  return {
    fileName: results.map((item) => item.fileName).join(", "),
    headers: results[0]!.headers,
    rows,
    transactions: results.flatMap((item) => item.transactions),
    issues,
    rowCount: results.reduce((sum, item) => sum + item.rowCount, 0),
    acceptedCount: results.reduce((sum, item) => sum + item.acceptedCount, 0),
    rejectedCount: results.reduce((sum, item) => sum + item.rejectedCount, 0),
    isComplete: results.every((item) => item.isComplete),
  };
}

export interface ImportReviewProps {
  /** Called with the calculated ledger (or null when cleared) so other panels can use the history. */
  onLedgerChange?: (ledger: LedgerResult | null) => void;
}

export default function ImportReview({ onLedgerChange }: ImportReviewProps = {}) {
  const [result, setResult] = useState<GenericCsvImportResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisSnapshot | null>(null);
  useEffect(() => {
    onLedgerChange?.(analysis?.ledger ?? null);
  }, [analysis, onLedgerChange]);
  const [resolutionByRow, setResolutionByRow] = useState<Record<number, InstrumentResolution>>({});
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [masterRetrievedAt, setMasterRetrievedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [quoteResults, setQuoteResults] = useState<Record<string, QuoteValidation>>({});
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteRetrievedAt, setQuoteRetrievedAt] = useState<string | null>(null);
  const [isFetchingQuotes, setIsFetchingQuotes] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    setError(null);
    setResolutionError(null);
    setMasterRetrievedAt(null);
    setResolutionByRow({});
    setQuoteResults({});
    setQuoteError(null);
    setQuoteRetrievedAt(null);
    setResult(null);
    setAnalysis(null);
    if (files.length === 0) return;

    setIsReading(true);
    try {
      const parsed: GenericCsvImportResult[] = [];
      const problems: string[] = [];
      for (const file of files) {
        const outcome = await readTradebookFile(file);
        if (typeof outcome === "string") problems.push(files.length > 1 ? file.name + ": " + outcome : outcome);
        else parsed.push(outcome);
      }
      if (problems.length > 0) setError(problems.join(" "));
      if (parsed.length > 0) setResult(mergeImportResults(parsed));
      if (problems.length > 0 && parsed.length === 0) event.target.value = "";
    } finally {
      setIsReading(false);
    }
  }

  async function handleResolveInstruments() {
    if (!result) return;
    setResolutionError(null);
    setIsResolving(true);

    try {
      const grouped = new Map<string, { reference: InstrumentReference; rowNumbers: number[] }>();
      for (const row of result.rows) {
        const reference = referenceForRow(row);
        if (!reference || reference.assetType === "mutual-fund" || reference.amfiSchemeCode) continue;
        const key = JSON.stringify(reference);
        const existing = grouped.get(key);
        if (existing) existing.rowNumbers.push(row.rowNumber);
        else grouped.set(key, { reference, rowNumbers: [row.rowNumber] });
      }

      const uniqueReferences = [...grouped.values()];
      if (uniqueReferences.length === 0) {
        setResolutionError("No rows contain an instrument identifier or symbol that can be resolved.");
        return;
      }

      const resolvedByRow: Record<number, InstrumentResolution> = {};
      let retrievedAt: string | null = null;

      for (let offset = 0; offset < uniqueReferences.length; offset += RESOLUTION_BATCH_SIZE) {
        const batch = uniqueReferences.slice(offset, offset + RESOLUTION_BATCH_SIZE);
        const response = await fetch("/api/instruments/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ references: batch.map((entry) => entry.reference) }),
        });

        const payload = (await response.json()) as ResolutionResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Instrument resolution failed.");
        }
        if (!Array.isArray(payload.results)) {
          throw new Error("Instrument resolver returned an unexpected response.");
        }

        retrievedAt = payload.masterRetrievedAt ?? retrievedAt;
        for (const item of payload.results) {
          const groupedEntry = batch[item.index];
          if (!groupedEntry) continue;
          for (const rowNumber of groupedEntry.rowNumbers) {
            resolvedByRow[rowNumber] = item.resolution;
          }
        }
      }

      const newlyResolvedRows = new Set<number>();
      const updatedRows = result.rows.map((row) => {
        const resolution = resolvedByRow[row.rowNumber];
        if (
          row.status !== "needs-resolution" ||
          resolution?.status !== "resolved" ||
          !row.candidateTransaction
        ) {
          return row;
        }

        const resolvedId = resolution.instrument.isin || resolution.instrument.instrumentId;
        const validation = validateTransaction({
          ...row.candidateTransaction,
          instrumentId: resolvedId,
        });
        if (validation.status !== "valid") return row;

        newlyResolvedRows.add(row.rowNumber);
        return {
          ...row,
          status: "valid" as const,
          transaction: validation.transaction,
          candidateTransaction: undefined,
          issues: row.issues.filter((issue) => issue.code !== "INSTRUMENT_RESOLUTION_REQUIRED"),
        };
      });

      const updatedIssues = result.issues.filter(
        (issue) =>
          issue.code !== "INSTRUMENT_RESOLUTION_REQUIRED" ||
          issue.rowNumber === undefined ||
          !newlyResolvedRows.has(issue.rowNumber),
      );
      const transactions = updatedRows.flatMap((row) =>
        row.status === "valid" && row.transaction ? [row.transaction] : [],
      );

      setResolutionByRow(resolvedByRow);
      setMasterRetrievedAt(retrievedAt);
      setResult({
        ...result,
        rows: updatedRows,
        transactions,
        acceptedCount: transactions.length,
        rejectedCount: updatedRows.length - transactions.length,
        issues: updatedIssues,
        isComplete: updatedIssues.length === 0,
      });
      setAnalysis(null);
      setQuoteResults({});
      setQuoteRetrievedAt(null);
    } catch (resolutionFailure) {
      setResolutionError(
        resolutionFailure instanceof Error
          ? resolutionFailure.message
          : "Instrument resolution failed. You can still review the CSV rows.",
      );
    } finally {
      setIsResolving(false);
    }
  }

  function handleCalculateAcceptedRows() {
    if (!result || result.transactions.length === 0) return;
    const ledger = buildLedger(result.transactions);
    const pnl = calculatePortfolioPnL(ledger, buildPositionValuations(ledger, quoteResults));
    setAnalysis({
      ledger,
      pnl,
      importIssueCount: result.issues.length,
      sourceRowCount: result.rowCount,
    });
  }

  async function handleFetchLiveQuotes() {
    if (!analysis || !result) return;
    setQuoteError(null);

    if (accessKey.trim() && accessKey.trim().length < 32) {
      setQuoteError("The Smartfolio access key is 32+ characters. Leave it empty if you signed in with the access code. Do not enter the Upstox token here.");
      return;
    }

    const positions = analysis.pnl.instrumentMetrics.filter((item) => item.openQuantity > 0);
    if (positions.length === 0) {
      setQuoteError("There are no open positions that need a current quote.");
      return;
    }

    const uniqueReferences = new Map<string, InstrumentReference>();
    for (const position of positions) {
      const matchingRow = result.rows.find(
        (row) => row.transaction?.instrumentId === position.instrumentId,
      );
      const reference = matchingRow
        ? referenceForRow(matchingRow) ?? { instrumentId: position.instrumentId }
        : { instrumentId: position.instrumentId };
      uniqueReferences.set(JSON.stringify(reference), reference);
    }

    const references = [...uniqueReferences.values()];
    const nextQuotes: Record<string, QuoteValidation> = { ...quoteResults };
    setIsFetchingQuotes(true);

    try {
      let retrievedAt: string | null = null;
      for (let offset = 0; offset < references.length; offset += 50) {
        const batch = references.slice(offset, offset + 50);
        const response = await fetch("/api/quotes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessKey.trim() ? { Authorization: "Bearer " + accessKey.trim() } : {}),
          },
          body: JSON.stringify({ references: batch }),
        });
        const payload = (await response.json()) as QuoteResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Live quote request failed.");
        }
        if (!Array.isArray(payload.quotes)) {
          throw new Error("Quote service returned an unexpected response.");
        }

        retrievedAt = payload.retrievedAt ?? retrievedAt;
        for (const item of payload.quotes) {
          nextQuotes[item.instrumentId] = item.result;
        }
      }

      setQuoteResults(nextQuotes);
      setQuoteRetrievedAt(retrievedAt);
      setAnalysis((current) =>
        current
          ? {
              ...current,
              pnl: calculatePortfolioPnL(current.ledger, buildPositionValuations(current.ledger, nextQuotes)),
            }
          : current,
      );
    } catch (quoteFailure) {
      setQuoteError(
        quoteFailure instanceof Error
          ? quoteFailure.message
          : "Live quotes could not be fetched. Current values remain unavailable.",
      );
    } finally {
      setIsFetchingQuotes(false);
    }
  }

  // Calculation is local and fast, so run it automatically whenever the
  // accepted rows change (new file or newly matched instruments).
  useEffect(() => {
    if (!result || result.transactions.length === 0) return;
    const ledger = buildLedger(result.transactions);
    setAnalysis({
      ledger,
      pnl: calculatePortfolioPnL(ledger, buildPositionValuations(ledger, {})),
      importIssueCount: result.issues.length,
      sourceRowCount: result.rowCount,
    });
  }, [result]);

  const previewRows = result?.rows.slice(0, PREVIEW_ROW_LIMIT) ?? [];

  // Human-readable name per instrument: resolved display name, else the file's symbol.
  const nameByInstrument: Record<string, string> = {};
  for (const row of result?.rows ?? []) {
    const id = row.transaction?.instrumentId;
    if (!id) continue;
    const resolution = resolutionByRow[row.rowNumber];
    const name =
      (resolution?.status === "resolved" ? resolution.instrument.displayName : undefined) ??
      rawValue(row, ["symbol", "ticker", "tradingSymbol", "scrip", "security", "schemeName", "fundName"]);
    if (name && (!nameByInstrument[id] || resolution?.status === "resolved")) nameByInstrument[id] = name;
  }
  // Group "sale exceeds open quantity" errors per stock, in plain language.
  const missingBuysById = new Map<string, { instrumentId: string; quantity: number; sales: number }>();
  for (const issue of analysis?.ledger.errors ?? []) {
    if (issue.code !== "OVERSELL" || !issue.instrumentId) continue;
    const match = issue.message.match(/Sale quantity ([\d.]+)/);
    const entry = missingBuysById.get(issue.instrumentId) ?? { instrumentId: issue.instrumentId, quantity: 0, sales: 0 };
    entry.quantity += match ? Number(match[1]) : 0;
    entry.sales += 1;
    missingBuysById.set(issue.instrumentId, entry);
  }
  const missingBuys = [...missingBuysById.values()];
  const otherErrors = (analysis?.ledger.errors ?? []).filter((issue) => !(issue.code === "OVERSELL" && issue.instrumentId));
  const instrumentLabel = (id: string) => nameByInstrument[id] ?? id.replace(/^SYMBOL:/, "");
  const resolvableRowCount = result?.rows.filter((row) => {
    if (!row.transaction && !row.candidateTransaction) return false;
    const reference = referenceForRow(row);
    return Boolean(reference && reference.assetType !== "mutual-fund" && !reference.amfiSchemeCode);
  }).length ?? 0;
  const openPositions = analysis?.pnl.instrumentMetrics.filter((item) => item.openQuantity > 0) ?? [];
  const hasMissingQuotes = openPositions.some((item) => item.marketValue === null);
  const resolvedCount = Object.values(resolutionByRow).filter((resolution) => resolution.status === "resolved").length;
  const ambiguousCount = Object.values(resolutionByRow).filter((resolution) => resolution.status === "ambiguous").length;
  const unresolvedCount = Object.values(resolutionByRow).filter((resolution) => resolution.status === "unresolved").length;
  const progressSteps = importProgress({
    hasFile: Boolean(result),
    acceptedCount: result?.acceptedCount ?? 0,
    needsResolution: resolvableRowCount > 0,
    resolved: Boolean(masterRetrievedAt),
    calculated: Boolean(analysis),
    hasOpenPositions: openPositions.length > 0,
    pricesFetched: Boolean(quoteRetrievedAt),
  });

  return (
    <section className="import-review" aria-labelledby="import-title">
      <div className="import-heading">
        <div>
          <p className="eyebrow">One-time · trade history</p>
          <h2 id="import-title">Add your trade history</h2>
          <p className="import-description">
            The file is parsed in your browser. Invalid rows stay visible; rows with a symbol but no stable identity can be resolved against a trusted instrument master.
          </p>
        </div>
        <span className="file-limit">XLSX / CSV / TXT · up to 5 MB</span>
      </div>

      <ol className="progress-steps" aria-label="Your progress">
        {progressSteps.map((step, index) => (
          <li key={step.key} className={"progress-step is-" + step.state} aria-current={step.state === "current" ? "step" : undefined}>
            <span className="progress-step-marker" aria-hidden="true">
              {step.state === "done" ? "✓" : step.state === "skipped" ? "–" : index + 1}
            </span>
            <span className="progress-step-text">
              <strong>{step.label}</strong>
              {step.state === "current" ? <small>{step.hint}</small> : null}
              {step.state === "skipped" ? <small>Not needed for this file</small> : null}
            </span>
          </li>
        ))}
      </ol>

      <label className="file-picker" htmlFor="tradebook-file">
        <span className="file-picker-icon" aria-hidden="true">↑</span>
        <span>
          <strong>{isReading ? "Reading files…" : "Choose your tradebook files (.xlsx or .csv)"}</strong>
          <small>Select <b>all</b> your yearly tradebook files together (Ctrl-click); overlapping dates are fine, each trade is counted once. Files stay in your browser. Zerodha Console exports (.xlsx or .csv) and delimited TXT are supported; PDF is not. If you match instruments, only identifiers such as ISINs are sent to the server.</small>
        </span>
        <input
          id="tradebook-file"
          type="file"
          accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          onChange={handleFileChange}
          disabled={isReading || isResolving}
        />
      </label>

      {error ? <p className="import-error" role="alert">{error}</p> : null}

      {result ? (
        <div className="import-results" aria-live="polite">
          <div className="import-summary">
            <div className="import-summary-title">
              <strong>{result.fileName}</strong>
              <span>{result.isComplete ? "CSV rows validated" : "Review needed"}</span>
            </div>
            <div className="import-stats">
              <div><strong>{result.rowCount}</strong><span>Data rows</span></div>
              <div><strong>{result.acceptedCount}</strong><span>Accepted</span></div>
              <div><strong>{result.rejectedCount}</strong><span>Needs attention</span></div>
            </div>
            <p className="import-safety-note">
              Preview only: no transactions are saved. Calculations use accepted rows only and do not fetch market prices.
            </p>
          </div>

          {result.issues.length > 0 ? (
            <div className="issue-banner">
              <strong>{result.issues.length} issue{result.issues.length === 1 ? "" : "s"} found</strong>
              <p>Invalid or unresolved rows are excluded from calculations. Results based on the remaining rows are partial.</p>
            </div>
          ) : null}

          {resolvableRowCount > 0 ? (
            <div className="resolution-action">
              <div>
                <strong>Resolve instrument identities</strong>
                <p>
                  Matches identifiers against the public Upstox instrument master. Ambiguous NSE/BSE matches remain unresolved.
                </p>
              </div>
              <button
                type="button"
                className="secondary-action-button"
                onClick={handleResolveInstruments}
                disabled={isReading || isResolving}
              >
                {isResolving ? "Resolving…" : "Resolve instruments"}
              </button>
            </div>
          ) : null}

          {resolutionError ? <p className="import-error" role="alert">{resolutionError}</p> : null}

          {masterRetrievedAt ? (
            <div className="resolution-summary">
              <span><strong>{resolvedCount}</strong> resolved</span>
              <span><strong>{ambiguousCount}</strong> ambiguous</span>
              <span><strong>{unresolvedCount}</strong> unresolved</span>
              <small>Instrument master retrieved at {new Date(masterRetrievedAt).toLocaleString()}</small>
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
              disabled={isReading || isResolving || result.transactions.length === 0}
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

              <ZerodhaHoldingsReconciliation positions={analysis.pnl.instrumentMetrics} />

              {openPositions.length > 0 ? (
                <div className="quote-access-panel">
                  <div>
                    <strong>Fetch validated market quotes</strong>
                    <p>
                      Equity/ETF quotes use the server&rsquo;s Upstox token; mutual-fund NAVs use AMFI. If you signed in with the access code, just click the button. Otherwise enter the Smartfolio access key (held in memory only; never enter the Upstox token here).
                    </p>
                  </div>
                  <label htmlFor="smartfolio-access-key">Smartfolio access key (optional)
                    <input
                      id="smartfolio-access-key"
                      type="password"
                      autoComplete="off"
                      value={accessKey}
                      onChange={(event) => setAccessKey(event.target.value)}
                      placeholder="32+ character key configured on the server"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-action-button"
                    onClick={handleFetchLiveQuotes}
                    disabled={isFetchingQuotes}
                  >
                    {isFetchingQuotes ? "Fetching quotes…" : "Fetch live quotes"}
                  </button>
                  {quoteError ? <p className="import-error" role="alert">{quoteError}</p> : null}
                  {quoteRetrievedAt ? <small className="quote-retrieved">Quote response received at {new Date(quoteRetrievedAt).toLocaleString()}.</small> : null}
                </div>
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
                      <th scope="col">Stock</th>
                      <th scope="col">Open qty</th>
                      <th scope="col">Cost basis</th>
                      <th scope="col">Current price</th>
                      <th scope="col">Market value</th>
                      <th scope="col">Unrealized P&amp;L</th>
                      <th scope="col">Position break-even</th>
                      <th scope="col">Lifecycle recovery</th>
                      <th scope="col">Quote source / status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.pnl.instrumentMetrics.map((item) => {
                      const quoteResult = quoteResults[item.instrumentId];
                      const quoteDetails =
                        quoteResult?.status === "available"
                          ? `${quoteResult.quote.source} · ${quoteResult.quote.quoteType} · ${new Date(quoteResult.quote.observedAt).toLocaleString()}`
                          : quoteResult?.status === "stale"
                            ? `Stale quote (${Math.round(quoteResult.ageMs / 3_600_000)}h old); last trade ${new Date(quoteResult.quote.observedAt).toLocaleString()}`
                            : quoteResult
                              ? "Unavailable: " + quoteResult.reason
                              : "Not requested";
                      return (
                      <tr key={item.instrumentId}>
                        <td>
                          <strong>{instrumentLabel(item.instrumentId)}</strong>
                          <small className="position-reason">{item.instrumentId.replace(/^ISIN:/, "")}</small>
                          {item.reason ? <small className="position-reason">{item.reason}</small> : null}
                        </td>
                        <td>{formatQuantity(item.openQuantity)}</td>
                        <td>{formatINR(item.openCostBasisTotal)}</td>
                        <td>{formatINR(quoteResult?.status === "available" ? quoteResult.quote.price : null)}</td>
                        <td>{formatINR(item.marketValue)}</td>
                        <td>{formatINR(item.unrealizedPnl)}</td>
                        <td>{item.positionBreakEvenPrice === null ? "Not applicable" : formatINR(item.positionBreakEvenPrice)}</td>
                        <td>{item.lifecycleRecoveryPrice === null ? "Unavailable" : formatINR(item.lifecycleRecoveryPrice)}</td>
                        <td><small className="quote-details">{quoteDetails}</small></td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>

              {analysis.ledger.errors.length > 0 ? (
                <div className="analysis-issues">
                  {missingBuys.length > 0 ? (
                    <>
                      <strong>Sales without an earlier buy in your files ({missingBuys.length} stock{missingBuys.length === 1 ? "" : "s"})</strong>
                      <p className="import-safety-note">
                        These shares were bought before your files start, so their cost is unknown and these sales are left out of profit/loss rather than guessed.
                        Fix: download the older tradebooks from Zerodha Console (one per year) and select them together with this one.
                      </p>
                      <ul>
                        {missingBuys.map((item) => (
                          <li key={item.instrumentId}>
                            <b>{instrumentLabel(item.instrumentId)}</b>: sold {formatQuantity(item.quantity)} share{item.quantity === 1 ? "" : "s"} in {item.sales} sale{item.sales === 1 ? "" : "s"} with no earlier buy in your files
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {otherErrors.length > 0 ? (
                    <>
                      <strong>Other rows that were not applied</strong>
                      <ul>
                        {otherErrors.map((issue, index) => (
                          <li key={issue.code + "-" + (issue.transactionId ?? "") + "-" + index}>{issue.message}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
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
                  <th scope="col">Transaction / resolution</th>
                  <th scope="col">Source data / issues</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => {
                  const resolution = resolutionByRow[row.rowNumber];
                  return (
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
                            <span>{row.transaction.instrumentId ? instrumentLabel(row.transaction.instrumentId) : "Portfolio-level"}</span>
                            {row.transaction.quantity !== undefined ? <span>Qty: {row.transaction.quantity}</span> : null}
                            {row.transaction.unitPrice !== undefined ? <span>Price: {row.transaction.unitPrice}</span> : null}
                            {row.transaction.amount !== undefined ? <span>Amount: {row.transaction.amount}</span> : null}
                          </div>
                        ) : "Not accepted"}
                        {resolution?.status === "resolved" ? (
                          <small className="resolution-note">Resolved: {resolution.instrument.displayName} ({resolution.instrument.exchange ?? "exchange unknown"})</small>
                        ) : null}
                        {resolution?.status === "ambiguous" ? (
                          <small className="resolution-note resolution-note-warning">Ambiguous: {resolution.reason}</small>
                        ) : null}
                        {resolution?.status === "unresolved" ? (
                          <small className="resolution-note resolution-note-warning">Unresolved: {resolution.reason}</small>
                        ) : null}
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
                  );
                })}
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

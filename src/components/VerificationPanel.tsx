"use client";

import type { ChangeEvent } from "react";
import type { PnlStatement } from "../importers/zerodhaPnl";
import type { StockVerification, VerificationResult } from "../engine/verification";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });

export const STATUS_TEXT: Record<StockVerification["status"], { icon: string; text: string; tone: string }> = {
  verified: { icon: "✓", text: "Verified with Zerodha", tone: "ok" },
  "needs-answer": { icon: "?", text: "Needs your answer", tone: "warn" },
  mismatch: { icon: "!", text: "Doesn't match Zerodha", tone: "bad" },
  unchecked: { icon: "–", text: "Not checked yet", tone: "muted" },
};

function show(value: number | null, unit: "money" | "quantity"): string {
  if (value === null) return "unknown";
  return unit === "money" ? money.format(value) : qty.format(value);
}

export function describeChecks(stock: StockVerification): string {
  if (stock.checks.length === 0) return "No Zerodha figure covers this stock yet.";
  return stock.checks
    .map((check) => `${check.ok ? "✓" : "✗"} ${check.label}: ours ${show(check.ours, check.unit)}, Zerodha ${show(check.theirs, check.unit)}`)
    .join("\n");
}

export interface VerificationPanelProps {
  result: VerificationResult;
  statements: PnlStatement[];
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveStatement: (index: number) => void;
  message: string | null;
}

export default function VerificationPanel({ result, statements, onUpload, onRemoveStatement, message }: VerificationPanelProps) {
  const { counts } = result;
  const total = result.stocks.length;
  const mismatches = result.stocks.filter((stock) => stock.status === "mismatch");
  const unchecked = result.stocks.filter((stock) => stock.status === "unchecked");
  return (
    <section className="home-section verify-panel" aria-labelledby="verify-title" id="verification">
      <h2 id="verify-title">Checked against Zerodha</h2>
      <div className="verify-chips">
        <span className="note-pill is-ok">✓ {counts.verified} verified</span>
        <span className="note-pill is-warn">? {counts["needs-answer"]} need an answer</span>
        <span className="note-pill is-bad">! {counts.mismatch} don&rsquo;t match</span>
        <span className="note-pill is-muted">– {counts.unchecked} not checked</span>
        <span className="verify-total">of {total} stocks</span>
      </div>
      <p className="home-note">
        Every stock is compared with Zerodha&rsquo;s own numbers: shares and average cost from your live holdings, and booked
        profit/loss and cost from Zerodha&rsquo;s P&amp;L statements. You only need to look at the ones that don&rsquo;t match or need an
        answer.
      </p>

      <div className="ask-card">
        <strong>Add Zerodha P&amp;L statements (recommended, once per year of history)</strong>
        <p><b>Why:</b> they contain Zerodha&rsquo;s booked profit/loss for every stock you sold — including IPOs, bonuses and demergers —
          so the app can check stocks you no longer hold.</p>
        <p>
          <b>How:</b> <a href="https://console.zerodha.com/reports/pnl" target="_blank" rel="noreferrer">Zerodha Console → Reports → P&amp;L</a>,
          segment <em>Equity</em>, pick one financial year (e.g. 1 Apr 2024 – 31 Mar 2025), <em>Download → XLSX</em>. Repeat for each year,
          then select all the files here. They stay in this browser.
        </p>
        <label className="secondary-action-button file-button">
          Choose P&amp;L statement files
          <input type="file" accept=".xlsx,.csv" multiple hidden onChange={onUpload} />
        </label>
        {message ? <p className="home-note" role="status">{message}</p> : null}
        {statements.length > 0 ? (
          <ul className="statement-list">
            {statements.map((statement, index) => (
              <li key={`${statement.from}-${statement.to}-${index}`}>
                {statement.from} to {statement.to} · {statement.rows.length} stocks
                <button type="button" className="link-button" onClick={() => onRemoveStatement(index)}>Remove</button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {mismatches.length > 0 ? (
        <details className="verify-list" open>
          <summary>Don&rsquo;t match Zerodha ({mismatches.length})</summary>
          <ul>
            {mismatches.map((stock) => (
              <li key={stock.instrumentId}>
                <b>{stock.symbol}</b>
                <ul>
                  {stock.checks.filter((check) => !check.ok).map((check) => (
                    <li key={check.label}>
                      {check.label}: ours <b>{show(check.ours, check.unit)}</b>, Zerodha <b>{show(check.theirs, check.unit)}</b>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="home-note">
            Common causes: an IPO, bonus, split or demerger not yet confirmed; intraday trades; or a missing tradebook year. Zerodha&rsquo;s
            figures include those automatically.
          </p>
        </details>
      ) : null}

      {unchecked.length > 0 ? (
        <details className="verify-list">
          <summary>Not checked yet ({unchecked.length})</summary>
          <p className="home-note">
            Stocks you no longer hold and that no P&amp;L statement covers yet. Add the P&amp;L statement for the year you sold them.
          </p>
          <p className="verify-names">{unchecked.map((stock) => stock.symbol).join(", ")}</p>
        </details>
      ) : null}
    </section>
  );
}

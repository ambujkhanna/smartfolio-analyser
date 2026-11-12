"use client";

import { useState } from "react";
import type { CanonicalTransaction } from "../domain/transaction";
import { formatRatio, knownDemergerTransaction, type Suggestion } from "../engine/corporateActions";
import BreakdownForm from "./BreakdownForm";

/**
 * "Needs your confirmation": corporate actions and missing purchases found in the
 * owner's own data. Each card explains what, why and how; nothing changes until the
 * owner confirms, and every confirmation can be undone.
 */
export interface CorporateActionsPanelProps {
  suggestions: Suggestion[];
  adjustments: CanonicalTransaction[];
  /** Instruments that can be chosen as a demerger parent (held at some point). */
  instruments: Array<{ instrumentId: string; label: string }>;
  labelOf: (instrumentId: string) => string;
  onApply: (transaction: CanonicalTransaction) => void;
  /** Saves several answers at once (a breakdown). */
  onApplyMany: (transactions: CanonicalTransaction[]) => void;
  onDismiss: (suggestionId: string) => void;
  onUndo: (transactionId: string) => void;
  /** All saved trades (the breakdown form needs shares held on a date). */
  transactions: CanonicalTransaction[];
}

const percent = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 2 });

function describeAdjustment(transaction: CanonicalTransaction, labelOf: (id: string) => string): string {
  const name = labelOf(transaction.instrumentId ?? "");
  const date = transaction.occurredAt.slice(0, 10);
  if (transaction.kind === "demerger" && transaction.demerger) {
    const parts = transaction.demerger.children.map((child) => `${labelOf(child.instrumentId)} ${percent.format(child.costFraction)}`);
    return `${name} demerger on ${date}: ${name} keeps ${percent.format(transaction.demerger.parentCostFraction)} of cost; ${parts.join(", ")}`;
  }
  if (transaction.kind === "split" || transaction.kind === "bonus") return `${name}: ${formatRatio(transaction.ratio ?? 1)} around ${date}`;
  if (transaction.kind === "transfer-out") return `${name}: ${transaction.quantity} shares moved out on ${date}${transaction.note ? ` — ${transaction.note}` : ""}`;
  if (transaction.kind === "sell") return `${name}: ${transaction.quantity} shares sold at ₹${transaction.unitPrice} on ${date}${transaction.note ? ` — ${transaction.note}` : ""}`;
  if (transaction.kind === "opening-balance") {
    return `${name}: ${transaction.quantity} shares added on ${date}${transaction.unitPrice ? ` at ₹${transaction.unitPrice} each` : " (cost unknown)"}${transaction.note ? ` — ${transaction.note}` : ""}`;
  }
  return `${name}: ${transaction.kind} on ${date}`;
}

function cardKey(suggestion: Suggestion): string {
  if (suggestion.type === "known-demerger") {
    return `${suggestion.id}|${suggestion.parentQuantity}|${suggestion.children.map((child) => child.preselected ?? "-").join(",")}|${suggestion.options.length}`;
  }
  if (suggestion.type === "missing-buys") return `${suggestion.id}|${suggestion.quantity}|${suggestion.beforeDate}`;
  return suggestion.id;
}

export default function CorporateActionsPanel(props: CorporateActionsPanelProps) {
  const { suggestions, adjustments, labelOf, onUndo } = props;
  if (suggestions.length === 0 && adjustments.length === 0) return null;
  return (
    <section className="home-section confirm-panel" aria-labelledby="confirm-title" id="needs-confirmation">
      <h2 id="confirm-title">
        {suggestions.length > 0 ? `Needs your confirmation (${suggestions.length})` : "Your adjustments"}
      </h2>
      {suggestions.length > 0 ? (
        <p className="home-note">
          The tradebook doesn&rsquo;t record splits, bonus shares, demergers, IPO allotments or transfers. These were found by
          comparing your trades with each other and with Zerodha. Nothing changes until you confirm, and you can undo it later.
        </p>
      ) : null}
      <div className="confirm-list">
        {suggestions.map((suggestion) => (
          // Re-create the card when matching improves (e.g. once Zerodha holdings arrive),
          // so its pre-selected choices and options are never stale.
          <SuggestionCard key={cardKey(suggestion)} suggestion={suggestion} {...props} />
        ))}
      </div>
      {adjustments.length > 0 ? (
        <details className="adjustments">
          <summary>Your saved answers ({adjustments.length}) — kept in this browser and in backups</summary>
          <ul>
            {adjustments.map((transaction) => (
              <li key={transaction.transactionId}>
                <span>{describeAdjustment(transaction, labelOf)}</span>
                <button type="button" className="link-button" onClick={() => onUndo(transaction.transactionId)}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function SuggestionCard({ suggestion, instruments, labelOf, onApply, onApplyMany, onDismiss, transactions }: CorporateActionsPanelProps & { suggestion: Suggestion }) {
  if (suggestion.type === "split-bonus") {
    return (
      <article className="ask-card">
        <strong>{suggestion.symbol}: looks like a {formatRatio(suggestion.ratio)}</strong>
        <p><b>Why:</b> {suggestion.reason}</p>
        <p>
          <b>When:</b> between {suggestion.windowFrom} and {suggestion.windowTo ?? "today"} (no trades in that window, so the
          exact day doesn&rsquo;t change the result).
        </p>
        <div className="card-actions">
          <button type="button" className="calculate-button" onClick={() => onApply(suggestion.transaction)}>Apply</button>
          <button type="button" className="link-button" onClick={() => onDismiss(suggestion.id)}>Not this</button>
        </div>
      </article>
    );
  }
  if (suggestion.type === "unexplained") {
    return (
      <article className={"ask-card " + (suggestion.intraday ? "is-neutral" : "is-warning")}>
        <strong>{suggestion.symbol}: quantities don&rsquo;t add up</strong>
        <p>{suggestion.message}</p>
        {suggestion.intraday ? (
          <p className="home-note">
            Nothing will be changed automatically. This stock&rsquo;s figures stay hidden until intraday matching is added.
          </p>
        ) : (
          <>
            <p><b>Please explain the difference</b> — break it down in as many lines as needed:</p>
            <BreakdownForm
              instrumentId={suggestion.instrumentId}
              symbol={suggestion.symbol}
              difference={suggestion.difference}
              {...(suggestion.date ? { beforeDate: suggestion.date } : {})}
              transactions={transactions}
              instruments={instruments}
              onSave={onApplyMany}
            />
          </>
        )}
        <div className="card-actions">
          <button type="button" className="link-button" onClick={() => onDismiss(suggestion.id)}>{suggestion.intraday ? "OK, hide this" : "Ignore"}</button>
        </div>
      </article>
    );
  }
  if (suggestion.type === "known-demerger") return <KnownDemergerCard suggestion={suggestion} labelOf={labelOf} onApply={onApply} onDismiss={onDismiss} />;
  if (suggestion.type === "quantity-mismatch") {
    return <MismatchCard suggestion={suggestion} instruments={instruments} transactions={transactions} onApplyMany={onApplyMany} onDismiss={onDismiss} />;
  }
  return <MissingBuysCard suggestion={suggestion} instruments={instruments} transactions={transactions} onApplyMany={onApplyMany} onDismiss={onDismiss} />;
}

function KnownDemergerCard({
  suggestion,
  labelOf,
  onApply,
  onDismiss,
}: {
  suggestion: Extract<Suggestion, { type: "known-demerger" }>;
  labelOf: (id: string) => string;
  onApply: (transaction: CanonicalTransaction) => void;
  onDismiss: (id: string) => void;
}) {
  const { event } = suggestion;
  const [choices, setChoices] = useState<string[]>(
    suggestion.children.map((child) => child.preselected ?? event.children[child.index]!.isin ?? `DEMERGED:${event.id}:${child.index}`),
  );
  const allMatched = suggestion.children.every((child) => child.preselected);
  const [editing, setEditing] = useState(!allMatched);
  const how: Record<string, string> = { isin: "matched by ISIN", symbol: "matched by symbol", quantity: "matched by share count" };
  return (
    <article className="ask-card">
      <strong>{event.title} — on {event.exDate}</strong>
      <p>
        <b>Why:</b> you held {suggestion.parentQuantity} shares of {labelOf(suggestion.parentId)} then. Your tradebook still puts
        all the original cost on it, which overstates its loss and leaves the new shares without a cost.
      </p>
      {!editing ? (
        <ul className="match-summary">
          <li>
            <b>{event.parent.name}</b> keeps {percent.format(event.parentCostFraction)} of the cost → <b>{labelOf(suggestion.parentId)}</b> ✓
          </li>
          {event.children.map((child, index) => (
            <li key={child.name}>
              <b>{child.name}</b>: {child.ratio} share per share held, {percent.format(child.costFraction)} of the cost →{" "}
              <b>{labelOf(choices[index]!)}</b> ✓ <span className="match-how">({how[suggestion.children[index]!.matchedBy ?? ""] ?? "matched"})</span>
            </li>
          ))}
        </ul>
      ) : null}
      <table className="mini-table" hidden={!editing}>
        <thead>
          <tr><th>Company</th><th>Shares per share held</th><th>Share of original cost</th><th>In your data</th></tr>
        </thead>
        <tbody>
          <tr><td>{event.parent.name}</td><td>keeps its shares</td><td>{percent.format(event.parentCostFraction)}</td><td>{labelOf(suggestion.parentId)}</td></tr>
          {event.children.map((child, index) => (
            <tr key={child.name}>
              <td>{child.name}</td>
              <td>{child.ratio}</td>
              <td>{percent.format(child.costFraction)}</td>
              <td>
                <select
                  value={choices[index]}
                  onChange={(changeEvent) => setChoices((current) => current.map((value, position) => (position === index ? changeEvent.target.value : value)))}
                >
                  {suggestion.options.map((option) => (
                    <option key={option.instrumentId} value={option.instrumentId}>{option.label}</option>
                  ))}
                  <option value={child.isin ?? `DEMERGED:${event.id}:${index}`}>Not in my trades/holdings</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="home-note"><b>Source:</b> {event.source}</p>
      <div className="card-actions">
        <button type="button" className="calculate-button" onClick={() => onApply(knownDemergerTransaction(event, suggestion.parentId, choices))}>
          {editing ? "Apply" : "Confirm and apply"}
        </button>
        {!editing ? (
          <button type="button" className="link-button" onClick={() => setEditing(true)}>Change matches</button>
        ) : null}
        <button type="button" className="link-button" onClick={() => onDismiss(suggestion.id)}>Not relevant</button>
      </div>
    </article>
  );
}

interface BreakdownCardProps {
  instruments: Array<{ instrumentId: string; label: string }>;
  transactions: CanonicalTransaction[];
  onApplyMany: (transactions: CanonicalTransaction[]) => void;
  onDismiss: (id: string) => void;
}

function MismatchCard({ suggestion, instruments, transactions, onApplyMany, onDismiss }: BreakdownCardProps & { suggestion: Extract<Suggestion, { type: "quantity-mismatch" }> }) {
  const difference = suggestion.zerodhaQuantity - suggestion.tradesQuantity;
  return (
    <article className="ask-card is-warning">
      <strong>
        {suggestion.symbol}: your trades add up to {suggestion.tradesQuantity} shares, Zerodha shows {suggestion.zerodhaQuantity}
      </strong>
      <p>
        <b>{Math.abs(difference)} share{Math.abs(difference) === 1 ? "" : "s"}</b>{" "}
        {difference > 0 ? "came into your account without a purchase in your files" : "left your account without a sale in your files"}.
        Real cost and recovery figures for this stock are hidden until that&rsquo;s explained.
      </p>
      <p><b>Please explain the difference</b> — break it down in as many lines as needed:</p>
      <BreakdownForm
        instrumentId={suggestion.instrumentId}
        symbol={suggestion.symbol}
        difference={difference}
        transactions={transactions}
        instruments={instruments}
        onSave={onApplyMany}
      />
      <div className="card-actions">
        <button type="button" className="link-button" onClick={() => onDismiss(suggestion.id)}>Ignore</button>
      </div>
    </article>
  );
}

function MissingBuysCard({ suggestion, instruments, transactions, onApplyMany, onDismiss }: BreakdownCardProps & { suggestion: Extract<Suggestion, { type: "missing-buys" }> }) {
  return (
    <article className="ask-card is-warning">
      <strong>
        {suggestion.symbol}: {suggestion.quantity} share{suggestion.quantity === 1 ? "" : "s"} with no purchase record
      </strong>
      <table className="mini-table count-table">
        <tbody>
          <tr><td>Bought (in your tradebook files)</td><td>{suggestion.counts.bought}</td></tr>
          <tr><td>Sold or moved out (in your files)</td><td>{suggestion.counts.sold}</td></tr>
          <tr><td>Held now (Zerodha)</td><td>{suggestion.counts.heldNow ?? "not connected"}</td></tr>
          <tr className="count-total"><td>No purchase record (sold + held − bought)</td><td>{suggestion.quantity}</td></tr>
        </tbody>
      </table>
      <p>{suggestion.reason}</p>
      <p>
        <b>Usually these are:</b> <b>IPO allotments</b> (they never appear in a tradebook), shares bought before your oldest
        file{suggestion.filesStart ? <> (your files start on {suggestion.filesStart})</> : null}, transfers from another
        account, or bonus/demerger shares.
      </p>
      <p><b>How did you get these {suggestion.quantity} shares?</b> Break it down in as many lines as needed:</p>
      <BreakdownForm
        instrumentId={suggestion.instrumentId}
        symbol={suggestion.symbol}
        difference={suggestion.quantity}
        beforeDate={suggestion.beforeDate}
        defaultType={suggestion.filesStart && suggestion.filesStart < suggestion.beforeDate ? "ipo" : "before-files"}
        transactions={transactions}
        instruments={instruments}
        onSave={onApplyMany}
      />
      <div className="card-actions">
        <button type="button" className="link-button" onClick={() => onDismiss(suggestion.id)}>Ignore</button>
      </div>
    </article>
  );
}

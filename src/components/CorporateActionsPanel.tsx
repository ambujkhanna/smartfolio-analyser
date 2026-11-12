"use client";

import { useState } from "react";
import type { CanonicalTransaction } from "../domain/transaction";
import { formatRatio, knownDemergerTransaction, type Suggestion } from "../engine/corporateActions";

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
  onDismiss: (suggestionId: string) => void;
  onUndo: (transactionId: string) => void;
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
  if (transaction.kind === "opening-balance") {
    return `${name}: ${transaction.quantity} shares added on ${date}${transaction.unitPrice ? ` at ₹${transaction.unitPrice} each` : " (cost unknown)"}${transaction.note ? ` — ${transaction.note}` : ""}`;
  }
  return `${name}: ${transaction.kind} on ${date}`;
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
          <SuggestionCard key={suggestion.id} suggestion={suggestion} {...props} />
        ))}
      </div>
      {adjustments.length > 0 ? (
        <details className="adjustments">
          <summary>Adjustments you&rsquo;ve confirmed ({adjustments.length})</summary>
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

function SuggestionCard({ suggestion, instruments, labelOf, onApply, onDismiss }: CorporateActionsPanelProps & { suggestion: Suggestion }) {
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
  if (suggestion.type === "known-demerger") return <KnownDemergerCard suggestion={suggestion} labelOf={labelOf} onApply={onApply} onDismiss={onDismiss} />;
  if (suggestion.type === "quantity-mismatch") return <MismatchCard suggestion={suggestion} onApply={onApply} onDismiss={onDismiss} />;
  return <MissingBuysCard suggestion={suggestion} instruments={instruments} onApply={onApply} onDismiss={onDismiss} />;
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
  return (
    <article className="ask-card">
      <strong>{event.title} — on {event.exDate}</strong>
      <p>
        <b>Why:</b> you held {suggestion.parentQuantity} shares of {labelOf(suggestion.parentId)} then. Your tradebook still puts
        all the original cost on it, which overstates its loss and leaves the new shares without a cost.
      </p>
      <table className="mini-table">
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
        <button type="button" className="calculate-button" onClick={() => onApply(knownDemergerTransaction(event, suggestion.parentId, choices))}>Apply</button>
        <button type="button" className="link-button" onClick={() => onDismiss(suggestion.id)}>Not relevant</button>
      </div>
    </article>
  );
}

function MismatchCard({
  suggestion,
  onApply,
  onDismiss,
}: {
  suggestion: Extract<Suggestion, { type: "quantity-mismatch" }>;
  onApply: (transaction: CanonicalTransaction) => void;
  onDismiss: (id: string) => void;
}) {
  const [ratio, setRatio] = useState("");
  const [date, setDate] = useState("");
  const value = Number(ratio);
  return (
    <article className="ask-card is-warning">
      <strong>{suggestion.symbol}: your trades add up to {suggestion.tradesQuantity} shares, Zerodha shows {suggestion.zerodhaQuantity}</strong>
      <p><b>Why it matters:</b> real cost and recovery figures for this stock are hidden until the quantities match.</p>
      <p>
        <b>How:</b> if there was a split or bonus, enter the shares you had <i>after</i> per share <i>before</i> (1:1 bonus = 2, 1:2
        bonus = 1.5, ₹10→₹2 split = 5) and the date. If shares came in another way, upload the missing tradebook period.
      </p>
      <div className="card-form">
        <label>Ratio <input inputMode="decimal" value={ratio} onChange={(event) => setRatio(event.target.value)} placeholder="e.g. 2" /></label>
        <label>Date <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <button
          type="button"
          className="calculate-button"
          disabled={!(value > 0 && value !== 1) || !date}
          onClick={() =>
            onApply({
              transactionId: `manual-split:${suggestion.instrumentId}:${date}`,
              kind: value >= 2 && Number.isInteger(value) ? "split" : "bonus",
              instrumentId: suggestion.instrumentId,
              symbol: suggestion.symbol,
              occurredAt: `${date}T00:00:00+05:30`,
              currency: "INR",
              ratio: value,
              note: "Entered by you",
              source: { fileName: "Your confirmation", rowNumber: 1 },
            })
          }
        >
          Apply
        </button>
        <button type="button" className="link-button" onClick={() => onDismiss(suggestion.id)}>Ignore</button>
      </div>
    </article>
  );
}

function MissingBuysCard({
  suggestion,
  instruments,
  onApply,
  onDismiss,
}: {
  suggestion: Extract<Suggestion, { type: "missing-buys" }>;
  instruments: Array<{ instrumentId: string; label: string }>;
  onApply: (transaction: CanonicalTransaction) => void;
  onDismiss: (id: string) => void;
}) {
  const [how, setHow] = useState("before-files");
  const [quantity, setQuantity] = useState(String(suggestion.quantity));
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(suggestion.beforeDate);
  const [parent, setParent] = useState(instruments.find((item) => item.instrumentId !== suggestion.instrumentId)?.instrumentId ?? "");
  const [childRatio, setChildRatio] = useState("1");
  const [costPercent, setCostPercent] = useState("");
  const qty = Number(quantity);
  const unitPrice = price.trim() === "" ? undefined : Number(price);
  const label: Record<string, string> = {
    "before-files": "Bought before my tradebook files start",
    ipo: "IPO allotment",
    transfer: "Transferred in from another account",
    gift: "Gift / inheritance",
    demerger: "Received from a demerger of another stock",
  };
  const demergerValid = parent && Number(childRatio) > 0 && Number(costPercent) > 0 && Number(costPercent) < 100 && date;
  return (
    <article className="ask-card is-warning">
      <strong>{suggestion.symbol}: {suggestion.quantity} shares without an earlier buy</strong>
      <p><b>Why:</b> {suggestion.reason} Without their cost, profit/loss for this stock can&rsquo;t be worked out.</p>
      <p><b>How did you get them?</b></p>
      <div className="card-form">
        <label>
          How
          <select value={how} onChange={(event) => setHow(event.target.value)}>
            {Object.entries(label).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        {how === "demerger" ? (
          <>
            <label>
              From which stock
              <select value={parent} onChange={(event) => setParent(event.target.value)}>
                {instruments.filter((item) => item.instrumentId !== suggestion.instrumentId).map((item) => (
                  <option key={item.instrumentId} value={item.instrumentId}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>Ex-date <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label>New shares per share held <input inputMode="decimal" value={childRatio} onChange={(event) => setChildRatio(event.target.value)} /></label>
            <label>
              % of original cost moved (from the company&rsquo;s notice)
              <input inputMode="decimal" value={costPercent} onChange={(event) => setCostPercent(event.target.value)} placeholder="e.g. 31.15" />
            </label>
          </>
        ) : (
          <>
            <label>Shares <input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
            <label>
              Cost per share (₹){" "}
              <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder={how === "gift" ? "giver's cost" : "leave empty if unknown"} />
            </label>
            <label>Date acquired <input type="date" value={date} max={suggestion.beforeDate} onChange={(event) => setDate(event.target.value)} /></label>
          </>
        )}
        <button
          type="button"
          className="calculate-button"
          disabled={how === "demerger" ? !demergerValid : !(qty > 0) || (unitPrice !== undefined && !(unitPrice > 0)) || !date}
          onClick={() => {
            if (how === "demerger") {
              const fraction = Number(costPercent) / 100;
              onApply({
                transactionId: `manual-demerger:${parent}:${suggestion.instrumentId}:${date}`,
                kind: "demerger",
                instrumentId: parent,
                occurredAt: `${date}T00:00:00+05:30`,
                currency: "INR",
                demerger: {
                  parentCostFraction: 1 - fraction,
                  children: [{ instrumentId: suggestion.instrumentId, ratio: Number(childRatio), costFraction: fraction, symbol: suggestion.symbol }],
                },
                note: "Entered by you",
                source: { fileName: "Your confirmation", rowNumber: 1 },
              });
              return;
            }
            onApply({
              transactionId: `manual-opening:${suggestion.instrumentId}:${date}`,
              kind: "opening-balance",
              instrumentId: suggestion.instrumentId,
              symbol: suggestion.symbol,
              occurredAt: `${date}T00:00:00+05:30`,
              currency: "INR",
              quantity: qty,
              ...(unitPrice !== undefined ? { unitPrice } : {}),
              note: label[how],
              source: { fileName: "Your confirmation", rowNumber: 1 },
            });
          }}
        >
          Save
        </button>
        <button type="button" className="link-button" onClick={() => onDismiss(suggestion.id)}>Ignore</button>
      </div>
    </article>
  );
}

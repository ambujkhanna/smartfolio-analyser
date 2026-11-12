"use client";

import { useState } from "react";
import type { CanonicalTransaction } from "../domain/transaction";
import { heldBefore } from "../engine/corporateActions";

/**
 * "Explain the difference": the owner gives a breakdown, in as many lines as needed, of
 * how a stock's shares came in or went out without a trade in the tradebook files. Saving
 * creates ordinary saved entries (kept in this browser and in backups), so the question is
 * never asked again; each can be undone.
 */

type LineType =
  | "ipo"
  | "before-files"
  | "transfer-in"
  | "gift-in"
  | "bonus"
  | "demerger"
  | "buyback"
  | "sold-elsewhere"
  | "transfer-out";

const TYPES: Record<LineType, { label: string; direction: "in" | "out"; price: "required" | "optional" | "none"; priceLabel?: string }> = {
  ipo: { label: "IPO allotment", direction: "in", price: "required", priceLabel: "IPO price (₹)" },
  "before-files": { label: "Bought before my tradebook files start", direction: "in", price: "required", priceLabel: "Buy price (₹)" },
  "transfer-in": { label: "Transferred in from another account", direction: "in", price: "required", priceLabel: "Original buy price (₹)" },
  "gift-in": { label: "Gift / inheritance received", direction: "in", price: "optional", priceLabel: "Giver's cost (₹, if known)" },
  bonus: { label: "Bonus shares or split (free shares)", direction: "in", price: "none" },
  demerger: { label: "Received from a demerger of another stock", direction: "in", price: "none" },
  buyback: { label: "Buyback / open offer / delisting (sold back)", direction: "out", price: "required", priceLabel: "Price received (₹)" },
  "sold-elsewhere": { label: "Sold outside these files", direction: "out", price: "required", priceLabel: "Sale price (₹)" },
  "transfer-out": { label: "Transferred out / gifted to someone", direction: "out", price: "none" },
};

interface Line {
  type: LineType;
  quantity: string;
  price: string;
  date: string;
  parent: string;
  ratio: string;
  costPercent: string;
}

export interface BreakdownFormProps {
  instrumentId: string;
  symbol: string;
  /** + shares came in without a purchase record; − shares left without a sale; null = unknown. */
  difference: number | null;
  /** Latest sensible date for incoming shares (day before the first sale that needed them). */
  beforeDate?: string;
  defaultType?: LineType;
  transactions: CanonicalTransaction[];
  instruments: Array<{ instrumentId: string; label: string }>;
  onSave: (entries: CanonicalTransaction[]) => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const num = (value: string) => (value.trim() === "" ? NaN : Number(value));

export default function BreakdownForm(props: BreakdownFormProps) {
  const { instrumentId, symbol, difference, beforeDate, transactions, instruments, onSave } = props;
  const direction: "in" | "out" | "any" = difference === null ? "any" : difference >= 0 ? "in" : "out";
  const firstType: LineType = props.defaultType ?? (direction === "out" ? "transfer-out" : "ipo");
  const blank = (type: LineType, quantity = ""): Line => ({
    type,
    quantity,
    price: "",
    date: beforeDate ?? today(),
    parent: instruments.find((item) => item.instrumentId !== instrumentId)?.instrumentId ?? "",
    ratio: "1",
    costPercent: "",
  });
  const [lines, setLines] = useState<Line[]>([blank(firstType, difference === null ? "" : String(Math.abs(difference)))]);
  const update = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, position) => (position === index ? { ...line, ...patch } : line)));

  const options = (Object.keys(TYPES) as LineType[]).filter((type) => direction === "any" || TYPES[type].direction === direction);

  // Shares each line accounts for (demerger: parent's shares × ratio on that date).
  const sharesOf = (line: Line): number => {
    if (line.type === "demerger") return heldBefore(transactions, line.parent, line.date) * num(line.ratio);
    return num(line.quantity);
  };
  const lineError = (line: Line): string | null => {
    const spec = TYPES[line.type];
    if (!line.date) return "Pick a date";
    if (line.type === "demerger") {
      if (!line.parent) return "Choose the stock it came from";
      if (!(num(line.ratio) > 0)) return "Enter shares per share held";
      if (!(num(line.costPercent) > 0 && num(line.costPercent) < 100)) return "Enter % of cost moved (0–100)";
      if (!(sharesOf(line) > 0)) return "You held none of that stock before this date";
      return null;
    }
    if (!(num(line.quantity) > 0)) return "Enter the number of shares";
    if (spec.price === "required" && !(num(line.price) > 0)) return `Enter ${spec.priceLabel?.toLowerCase() ?? "the price"}`;
    if (spec.price === "optional" && line.price.trim() !== "" && !(num(line.price) > 0)) return "Price must be positive";
    if (line.type === "bonus" && !(heldBefore(transactions, instrumentId, line.date) > 0)) return "You held no shares before this date";
    if (spec.direction === "in" && beforeDate && line.date > beforeDate && line.type !== "bonus") return `Date must be on or before ${beforeDate}`;
    return null;
  };
  const net = lines.reduce((sum, line) => {
    const shares = sharesOf(line);
    if (!Number.isFinite(shares)) return sum;
    return sum + (TYPES[line.type].direction === "in" ? shares : -shares);
  }, 0);
  const errors = lines.map(lineError);
  const balanced = difference === null || Math.abs(net - difference) < 1e-6;
  const canSave = errors.every((error) => error === null) && balanced;

  function save() {
    const stamp = Date.now();
    const entries: CanonicalTransaction[] = lines.map((line, index) => {
      const id = `answer:${line.type}:${instrumentId}:${line.date}:${index}:${stamp}`;
      const base = { transactionId: id, currency: "INR", note: TYPES[line.type].label, source: { fileName: "Your confirmation", rowNumber: index + 1 } };
      if (line.type === "demerger") {
        const fraction = num(line.costPercent) / 100;
        return {
          ...base,
          kind: "demerger" as const,
          instrumentId: line.parent,
          occurredAt: `${line.date}T00:00:00+05:30`,
          demerger: { parentCostFraction: 1 - fraction, children: [{ instrumentId, ratio: num(line.ratio), costFraction: fraction, symbol }] },
        };
      }
      if (line.type === "bonus") {
        const held = heldBefore(transactions, instrumentId, line.date);
        return { ...base, kind: "bonus" as const, instrumentId, symbol, occurredAt: `${line.date}T00:00:00+05:30`, ratio: (held + num(line.quantity)) / held };
      }
      if (TYPES[line.type].direction === "out") {
        return line.type === "transfer-out"
          ? { ...base, kind: "transfer-out" as const, instrumentId, symbol, occurredAt: `${line.date}T15:30:00+05:30`, quantity: num(line.quantity) }
          : { ...base, kind: "sell" as const, instrumentId, symbol, occurredAt: `${line.date}T15:30:00+05:30`, quantity: num(line.quantity), unitPrice: num(line.price) };
      }
      return {
        ...base,
        kind: "opening-balance" as const,
        instrumentId,
        symbol,
        occurredAt: `${line.date}T00:00:00+05:30`,
        quantity: num(line.quantity),
        ...(line.price.trim() !== "" ? { unitPrice: num(line.price) } : {}),
      };
    });
    onSave(entries);
  }

  return (
    <div className="breakdown">
      {lines.map((line, index) => {
        const spec = TYPES[line.type];
        return (
          <div className="card-form breakdown-line" key={index}>
            <label>
              {index === 0 ? "How" : "And"}
              <select value={line.type} onChange={(event) => update(index, { type: event.target.value as LineType })}>
                {options.map((type) => (
                  <option key={type} value={type}>{TYPES[type].label}</option>
                ))}
              </select>
            </label>
            {line.type === "demerger" ? (
              <>
                <label>
                  From which stock
                  <select value={line.parent} onChange={(event) => update(index, { parent: event.target.value })}>
                    {instruments.filter((item) => item.instrumentId !== instrumentId).map((item) => (
                      <option key={item.instrumentId} value={item.instrumentId}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>New shares per share held <input inputMode="decimal" value={line.ratio} onChange={(event) => update(index, { ratio: event.target.value })} /></label>
                <label>% of cost moved <input inputMode="decimal" value={line.costPercent} placeholder="e.g. 31.15" onChange={(event) => update(index, { costPercent: event.target.value })} /></label>
              </>
            ) : (
              <>
                <label>{line.type === "bonus" ? "Free shares received" : "Shares"} <input inputMode="decimal" value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} /></label>
                {spec.price !== "none" ? (
                  <label>{spec.priceLabel} <input inputMode="decimal" value={line.price} onChange={(event) => update(index, { price: event.target.value })} /></label>
                ) : null}
              </>
            )}
            <label>{spec.direction === "in" ? "Date received" : "Date"} <input type="date" value={line.date} onChange={(event) => update(index, { date: event.target.value })} /></label>
            {lines.length > 1 ? (
              <button type="button" className="link-button" onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>Remove</button>
            ) : null}
            {errors[index] ? <small className="breakdown-error">{errors[index]}</small> : null}
          </div>
        );
      })}
      <div className="card-actions">
        <button type="button" className="link-button" onClick={() => setLines((current) => [...current, blank(firstType)])}>+ Add another line</button>
        {difference !== null ? (
          <span className={"breakdown-total " + (balanced ? "is-ok" : "is-warn")}>
            Explained {Math.round(Math.abs(net) * 1e4) / 1e4} of {Math.abs(difference)} shares {balanced ? "✓" : ""}
          </span>
        ) : null}
        <button type="button" className="calculate-button" disabled={!canSave} onClick={save}>Save answer</button>
      </div>
      <p className="home-note">Saved in this browser and in your backups — you won&rsquo;t be asked about {symbol} again. You can undo it any time.</p>
    </div>
  );
}

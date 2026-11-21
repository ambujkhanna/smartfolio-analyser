"use client";

import { useState } from "react";
import type { AlertRule, AlertRuleKind, AlertSettings, PortfolioAlert } from "../engine/alerts";

/**
 * Alerts from the owner's own numbers and rules. They state facts; they are not
 * recommendations to buy or sell.
 */
export interface AlertsPanelProps {
  alerts: PortfolioAlert[];
  seen: Set<string>;
  rules: AlertRule[];
  settings: AlertSettings;
  stocks: Array<{ instrumentId: string; label: string }>;
  /** Fully sold stocks with a net loss (for the sold-stock conditions). */
  soldStocks: Array<{ instrumentId: string; label: string }>;
  labelOf: (id: string) => string;
  onMarkSeen: () => void;
  onAddRule: (rule: AlertRule) => void;
  onRemoveRule: (id: string) => void;
  onSettings: (settings: AlertSettings) => void;
}

const ICON: Record<PortfolioAlert["tone"], string> = { good: "✓", info: "ℹ", warn: "⚠" };
const KINDS: Record<AlertRuleKind, { label: string; unit: string }> = {
  "below-real-average": { label: "falls below my real average by", unit: "%" },
  "above-real-average": { label: "rises above my real average by", unit: "%" },
  "price-below": { label: "price falls to or below", unit: "₹" },
  "price-above": { label: "price rises to or above", unit: "₹" },
  "below-sale-price": { label: "(sold at a loss) falls below my last sale price by", unit: "%" },
  "above-original-cost": { label: "(sold at a loss) is back above my original buy price", unit: "" },
};
const SOLD_KINDS: AlertRuleKind[] = ["below-sale-price", "above-original-cost"];

export default function AlertsPanel(props: AlertsPanelProps) {
  const { alerts, seen, rules, settings, stocks, soldStocks, labelOf, onMarkSeen, onAddRule, onRemoveRule, onSettings } = props;
  const [showAll, setShowAll] = useState(false);
  const [stock, setStock] = useState(stocks[0]?.instrumentId ?? "");
  const [kind, setKind] = useState<AlertRuleKind>("below-real-average");
  const [value, setValue] = useState("");
  const [limit, setLimit] = useState(String(settings.concentrationPercent));
  const fresh = alerts.filter((alert) => !seen.has(alert.id));
  const order = { warn: 0, good: 1, info: 2 } as const;
  const sorted = [...alerts].sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)) || order[a.tone] - order[b.tone]);
  const visible = showAll ? sorted : sorted.slice(0, 6);
  const amount = Number(value);
  const forSold = SOLD_KINDS.includes(kind);
  const choices = forSold ? soldStocks : stocks;
  const chosen = choices.some((item) => item.instrumentId === stock) ? stock : choices[0]?.instrumentId ?? "";
  const needsValue = KINDS[kind].unit !== "";

  return (
    <section className="home-section alerts-panel" aria-labelledby="alerts-title">
      <div className="alerts-head">
        <h2 id="alerts-title">
          Alerts {alerts.length > 0 ? <span className="alerts-count">{alerts.length}{fresh.length > 0 ? ` · ${fresh.length} new` : ""}</span> : null}
        </h2>
        {fresh.length > 0 ? <button type="button" className="link-button" onClick={onMarkSeen}>Mark all as seen</button> : null}
      </div>
      {alerts.length === 0 ? <p className="home-note">Nothing needs your attention right now.</p> : null}
      <ul className="alert-list">
        {visible.map((alert) => (
          <li key={alert.id} className={"alert-item is-" + alert.tone}>
            <span className="alert-icon" aria-hidden="true">{ICON[alert.tone]}</span>
            <div>
              <strong>{alert.title}</strong> {!seen.has(alert.id) ? <span className="alert-new">NEW</span> : null}
              <p>{alert.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {sorted.length > 6 ? (
        <button type="button" className="link-button" onClick={() => setShowAll((current) => !current)}>
          {showAll ? "Show fewer" : `Show all ${sorted.length} alerts`}
        </button>
      ) : null}

      <details className="alert-settings">
        <summary>Your alert rules and settings ({rules.length} rule{rules.length === 1 ? "" : "s"})</summary>
        {rules.length > 0 ? (
          <ul className="statement-list">
            {rules.map((rule) => (
              <li key={rule.id}>
                {labelOf(rule.instrumentId)} — {KINDS[rule.kind].label}{" "}
                {KINDS[rule.kind].unit === "₹" ? `₹${rule.value}` : KINDS[rule.kind].unit === "%" ? `${rule.value}%` : ""}
                <button type="button" className="link-button" onClick={() => onRemoveRule(rule.id)}>Remove</button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="card-form">
          <label>
            Tell me when
            <select value={chosen} onChange={(event) => setStock(event.target.value)}>
              {choices.map((item) => <option key={item.instrumentId} value={item.instrumentId}>{item.label}</option>)}
            </select>
          </label>
          <label>
            Condition
            <select value={kind} onChange={(event) => setKind(event.target.value as AlertRuleKind)}>
              {(Object.keys(KINDS) as AlertRuleKind[]).map((item) => <option key={item} value={item}>{KINDS[item].label}</option>)}
            </select>
          </label>
          {needsValue ? (
            <label>
              {KINDS[kind].unit === "₹" ? "Price (₹)" : "Percent (%)"}
              <input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder={KINDS[kind].unit === "₹" ? "e.g. 900" : "e.g. 15"} />
            </label>
          ) : null}
          <button
            type="button"
            className="secondary-action-button"
            disabled={!chosen || (needsValue && !(amount > 0))}
            onClick={() => {
              onAddRule({ id: `rule-${Date.now()}`, instrumentId: chosen, kind, value: needsValue ? amount : 0 });
              setValue("");
            }}
          >
            Add alert
          </button>
        </div>
        <div className="card-form">
          <label>
            Warn when one stock is more than (% of portfolio)
            <input inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} />
          </label>
          <button
            type="button"
            className="secondary-action-button"
            disabled={!(Number(limit) > 0 && Number(limit) <= 100) || Number(limit) === settings.concentrationPercent}
            onClick={() => onSettings({ ...settings, concentrationPercent: Number(limit) })}
          >
            Save limit
          </button>
        </div>
        <p className="home-note">Rules and settings are saved in this browser and in your backups.</p>
      </details>
      <p className="home-note">Alerts state facts from your own trades, Zerodha&rsquo;s prices and rules you set. They are not recommendations to buy or sell.</p>
    </section>
  );
}

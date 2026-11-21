import type { CanonicalTransaction } from "../domain/transaction";
import type { LedgerResult } from "./buildLedger";
import type { ReconciledHolding } from "./reconcileHoldings";

/**
 * Alerts from the owner's own numbers and rules — never predictions or advice.
 * Every alert states a fact (a price vs your break-even, a date, a share of the
 * portfolio, a data problem); what to do is the owner's decision.
 */
export type AlertTone = "good" | "info" | "warn";

export interface PortfolioAlert {
  /** Stable id per condition, so "new since last visit" can be tracked. */
  id: string;
  tone: AlertTone;
  category: "break-even" | "recovery" | "tax" | "concentration" | "target" | "data";
  title: string;
  detail: string;
  symbol?: string;
}

export type AlertRuleKind =
  | "below-real-average"
  | "above-real-average"
  | "price-below"
  | "price-above"
  /** Sold stocks: price X% below the last sale price. */
  | "below-sale-price"
  /** Sold stocks: price back at or above the original average buy price. */
  | "above-original-cost";

export interface AlertRule {
  id: string;
  instrumentId: string;
  kind: AlertRuleKind;
  /** Percent for the *-real-average kinds, rupees for price-* kinds. */
  value: number;
}

export interface AlertSettings {
  /** Warn when one stock is more than this % of the portfolio value. */
  concentrationPercent: number;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = { concentrationPercent: 20 };

/** "Still to recover" per stock on a day, to show progress over time. */
export interface RecoverySnapshot {
  date: string;
  values: Record<string, number>;
}

export interface AlertInput {
  today: string; // YYYY-MM-DD (IST)
  rows: ReconciledHolding[];
  ledger: LedgerResult | null;
  transactions: CanonicalTransaction[];
  rules: AlertRule[];
  settings: AlertSettings;
  snapshots: RecoverySnapshot[];
  /** Fully sold stocks with a net loss, with today's price when fetched. */
  sold?: Array<{ instrumentId: string; label: string; lastSalePrice: number; averageBuyPrice: number; price: number | null }>;
  health: {
    mismatches: number;
    needsAnswer: number;
    lastZerodhaSyncAt: string | null;
    lastBackupAt: string | null;
    hasSavedData: boolean;
    connected: boolean;
  };
}

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const percent = (value: number) => `${Math.round(value * 10) / 10}%`;

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

/** The original purchase behind a lot (demerger lots are "<demergerId>><originalLotId>"). */
function originalLotId(lotId: string): string {
  const parts = lotId.split(">");
  return parts[parts.length - 1]!;
}

function financialYearEnd(today: string): string {
  const year = Number(today.slice(0, 4));
  return today.slice(5) <= "03-31" ? `${year}-03-31` : `${year + 1}-03-31`;
}

export function buildAlerts(input: AlertInput): PortfolioAlert[] {
  const { today, rows, ledger, transactions, rules, settings, snapshots, health } = input;
  const soldById = new Map((input.sold ?? []).map((item) => [item.instrumentId, item]));
  const alerts: PortfolioAlert[] = [];
  const name = (row: ReconciledHolding) => row.symbols[0] ?? row.isin;
  const byIsin = new Map(rows.map((row) => [row.isin, row]));

  // 1. Break-even reached / close to it (only stocks whose history is complete).
  for (const row of rows) {
    const life = row.lifecycle;
    const price = row.brokerLastPrice;
    if (!life || price === null) continue;
    if (life.toRecover <= 0 && life.lossBooked > 0.5) {
      alerts.push({
        id: `recovered:${row.isin}`,
        tone: "good",
        category: "break-even",
        symbol: name(row),
        title: `${name(row)} has made back all its past losses`,
        detail: `Price ${money.format(price)} is at or above your real break-even ${money.format(life.breakEvenPrice)} (it had ${money.format(life.lossBooked)} of booked losses). Overall on this stock: ${money.format(life.overallPnl)}.`,
      });
    } else if (life.toRecover > 0 && life.breakEvenPrice > 0 && price >= life.breakEvenPrice * 0.95) {
      alerts.push({
        id: `near-break-even:${row.isin}`,
        tone: "info",
        category: "break-even",
        symbol: name(row),
        title: `${name(row)} is within ${percent(((life.breakEvenPrice - price) / life.breakEvenPrice) * 100)} of your real break-even`,
        detail: `Price ${money.format(price)}, real break-even ${money.format(life.breakEvenPrice)}; ${money.format(life.toRecover)} still to recover.`,
      });
    }
  }

  // 2. Recovery progress vs about a month ago (±10% and at least ₹100).
  const monthAgo = addDays(today, -30);
  const reference = [...snapshots].filter((snapshot) => snapshot.date <= monthAgo).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (reference) {
    for (const row of rows) {
      const life = row.lifecycle;
      const before = reference.values[row.isin];
      if (!life || before === undefined || before <= 0) continue;
      const change = life.toRecover - before;
      if (Math.abs(change) < 100 || Math.abs(change) / before < 0.1) continue;
      alerts.push({
        id: `recovery:${row.isin}:${reference.date}`,
        tone: change < 0 ? "good" : "warn",
        category: "recovery",
        symbol: name(row),
        title: `${name(row)}: still to recover ${change < 0 ? "fell" : "rose"} to ${money.format(life.toRecover)}`,
        detail: `It was ${money.format(before)} on ${reference.date}.`,
      });
    }
  }

  // 3. Tax timing (Indian listed equity: held more than 12 months = long-term).
  if (ledger) {
    const dateOf = new Map(transactions.map((transaction) => [transaction.transactionId, transaction.occurredAt.slice(0, 10)]));
    const fyEnd = financialYearEnd(today);
    const harvestSeason = daysBetween(today, fyEnd) <= 59 && daysBetween(today, fyEnd) >= 0;
    for (const instrument of ledger.instruments) {
      const row = byIsin.get(instrument.instrumentId);
      const price = row?.brokerLastPrice ?? null;
      if (!row || price === null) continue;
      let soonQuantity = 0;
      let soonGain = 0;
      let soonDate = null as string | null;
      let lossQuantity = 0;
      let loss = 0;
      for (const lot of instrument.lots) {
        if (lot.remainingQuantity <= 1e-9 || lot.remainingCostTotal === null) continue;
        const bought = dateOf.get(originalLotId(lot.openedByTransactionId));
        const gain = price * lot.remainingQuantity - lot.remainingCostTotal;
        if (bought) {
          const longTermFrom = addDays(addMonths(bought, 12), 1);
          const daysLeft = daysBetween(today, longTermFrom);
          if (daysLeft > 0 && daysLeft <= 30 && gain > 0) {
            soonQuantity += lot.remainingQuantity;
            soonGain += gain;
            soonDate = soonDate === null || longTermFrom > soonDate ? longTermFrom : soonDate;
          }
        }
        if (harvestSeason && gain < 0) {
          lossQuantity += lot.remainingQuantity;
          loss += -gain;
        }
      }
      if (soonQuantity > 0 && soonDate) {
        alerts.push({
          id: `long-term:${row.isin}:${soonDate}`,
          tone: "info",
          category: "tax",
          symbol: name(row),
          title: `${soonQuantity} ${name(row)} shares become long-term by ${soonDate}`,
          detail: `They are currently ${money.format(soonGain)} in profit. Selling after this date is taxed as long-term (lower rate under current rules); selling before is short-term. Check current tax rules before acting.`,
        });
      }
      if (lossQuantity > 0 && loss >= 500) {
        alerts.push({
          id: `harvest:${row.isin}:${fyEnd}`,
          tone: "info",
          category: "tax",
          symbol: name(row),
          title: `${name(row)}: ${money.format(loss)} unrealised loss before the financial year ends (${fyEnd})`,
          detail: `${lossQuantity} shares are below their cost. A loss booked before ${fyEnd} can offset gains booked this year. This is information, not advice — check with a tax adviser.`,
        });
      }
    }
  }

  // 4. Concentration.
  const values = rows
    .map((row) => ({ row, value: row.brokerLastPrice !== null ? row.brokerLastPrice * row.brokerQuantity : 0 }))
    .filter((item) => item.value > 0);
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (total > 0) {
    for (const { row, value } of values) {
      const share = (value / total) * 100;
      if (share > settings.concentrationPercent) {
        alerts.push({
          id: `concentration:${row.isin}`,
          tone: "warn",
          category: "concentration",
          symbol: name(row),
          title: `${name(row)} is ${percent(share)} of your portfolio`,
          detail: `Above your limit of ${settings.concentrationPercent}%. Value ${money.format(value)} of ${money.format(total)}.`,
        });
      }
    }
  }

  // 5. Owner's own targets.
  for (const rule of rules) {
    if (rule.kind === "below-sale-price" || rule.kind === "above-original-cost") {
      const item = soldById.get(rule.instrumentId);
      if (!item || item.price === null) continue;
      if (rule.kind === "below-sale-price" && item.price <= item.lastSalePrice * (1 - rule.value / 100)) {
        alerts.push({
          id: `target:${rule.id}`,
          tone: "info",
          category: "target",
          symbol: item.label,
          title: `${item.label}: your alert triggered`,
          detail: `Price ${money.format(item.price)} is ${percent(((item.lastSalePrice - item.price) / item.lastSalePrice) * 100)} below your last sale price ${money.format(item.lastSalePrice)} (your alert: ${rule.value}%).`,
        });
      }
      if (rule.kind === "above-original-cost" && item.price >= item.averageBuyPrice) {
        alerts.push({
          id: `target:${rule.id}`,
          tone: "info",
          category: "target",
          symbol: item.label,
          title: `${item.label}: back above your original buy price`,
          detail: `Price ${money.format(item.price)} is at or above your average buy price ${money.format(item.averageBuyPrice)} for the shares you sold at a loss.`,
        });
      }
      continue;
    }
    const row = byIsin.get(rule.instrumentId);
    const price = row?.brokerLastPrice ?? null;
    if (!row || price === null) continue;
    const average = row.ledgerAveragePrice;
    let hit = false;
    let text = "";
    if (rule.kind === "price-below" && price <= rule.value) {
      hit = true;
      text = `Price ${money.format(price)} is at or below your target ${money.format(rule.value)}.`;
    } else if (rule.kind === "price-above" && price >= rule.value) {
      hit = true;
      text = `Price ${money.format(price)} is at or above your target ${money.format(rule.value)}.`;
    } else if (rule.kind === "below-real-average" && average && price <= average * (1 - rule.value / 100)) {
      hit = true;
      text = `Price ${money.format(price)} is ${percent(((average - price) / average) * 100)} below your real average ${money.format(average)} (your alert: ${rule.value}%).`;
    } else if (rule.kind === "above-real-average" && average && price >= average * (1 + rule.value / 100)) {
      hit = true;
      text = `Price ${money.format(price)} is ${percent(((price - average) / average) * 100)} above your real average ${money.format(average)} (your alert: ${rule.value}%).`;
    }
    if (hit) {
      alerts.push({ id: `target:${rule.id}`, tone: "info", category: "target", symbol: name(row), title: `${name(row)}: your alert triggered`, detail: text });
    }
  }

  // 6. Data health.
  if (health.mismatches > 0) {
    alerts.push({ id: `data:mismatch:${health.mismatches}`, tone: "warn", category: "data", title: `${health.mismatches} stock${health.mismatches === 1 ? "" : "s"} don't match Zerodha`, detail: "Their figures may be wrong until fixed — see “Checked against Zerodha”." });
  }
  if (health.needsAnswer > 0) {
    alerts.push({ id: `data:answers:${health.needsAnswer}`, tone: "warn", category: "data", title: `${health.needsAnswer} item${health.needsAnswer === 1 ? "" : "s"} need your answer`, detail: "See “Needs your confirmation” — each takes a minute and is never asked again." });
  }
  if (health.hasSavedData && !health.connected && (!health.lastZerodhaSyncAt || daysBetween(health.lastZerodhaSyncAt.slice(0, 10), today) > 7)) {
    alerts.push({ id: `data:sync:${today.slice(0, 7)}`, tone: "info", category: "data", title: "Zerodha not checked for over a week", detail: "Connect Zerodha on days you trade so new trades are saved automatically; otherwise upload the latest tradebook." });
  }
  if (health.hasSavedData && (!health.lastBackupAt || daysBetween(health.lastBackupAt.slice(0, 10), today) > 30)) {
    alerts.push({ id: `data:backup:${today.slice(0, 7)}`, tone: "info", category: "data", title: "No backup in the last 30 days", detail: "Download a backup so your trades and answers are safe if browser data is cleared." });
  }
  return alerts;
}

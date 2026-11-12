import type { CanonicalTransaction } from "../domain/transaction";
import { stableTransactionSort } from "./buildLedger";

/**
 * Finds corporate actions the tradebook does not record, using only the owner's own
 * data (trades + Zerodha holdings) and a small list of verified demergers. Nothing is
 * fetched from exchange websites. Every finding is a suggestion the owner confirms;
 * confirmed ones are saved as transactions and can be undone.
 */

// ---------------------------------------------------------------------------
// Verified demergers (official cost-of-acquisition apportionment, published by the companies)
// ---------------------------------------------------------------------------

export interface KnownDemerger {
  id: string;
  title: string;
  /** Ex-date (first day the parent trades without the entitlement), IST. */
  exDate: string;
  parent: { isins: string[]; symbols: string[]; name: string };
  parentCostFraction: number;
  children: Array<{
    name: string;
    /** Exact trading symbols used to pre-select the matching stock in the owner's data. */
    symbols: string[];
    isin?: string;
    ratio: number;
    costFraction: number;
  }>;
  source: string;
}

export const KNOWN_DEMERGERS: KnownDemerger[] = [
  {
    id: "tata-motors-2025",
    title: "Tata Motors demerger (passenger and commercial vehicles)",
    exDate: "2025-10-14",
    parent: { isins: ["INE155A01022"], symbols: ["TATAMOTORS", "TMPV"], name: "Tata Motors Passenger Vehicles (TMPV)" },
    parentCostFraction: 0.6885,
    children: [
      { name: "Tata Motors commercial vehicles (TMCV)", symbols: ["TMCV", "TMLCV"], isin: "INE1TAE01010", ratio: 1, costFraction: 0.3115 },
    ],
    source: "Company cost-of-acquisition notice, 12 Nov 2025: TMPV 68.85%, TMCV 31.15%; 1 TMCV share per share held on 14 Oct 2025.",
  },
  {
    id: "vedanta-2026",
    title: "Vedanta demerger into five companies",
    exDate: "2026-04-30",
    parent: { isins: ["INE205A01025"], symbols: ["VEDL"], name: "Vedanta" },
    parentCostFraction: 0.5234,
    children: [
      // Listed names/symbols (seen in Zerodha holdings): VOGL = Vedanta Oil & Gas (formerly Malco Energy),
      // VEDPOWER = Vedanta Power (Talwandi Sabo Power), VAML, VISL.
      { name: "Vedanta Oil & Gas — VOGL (formerly Malco Energy)", symbols: ["VOGL", "MALCO"], isin: "INE704J01044", ratio: 1, costFraction: 0.2149 },
      { name: "Vedanta Power — VEDPOWER (Talwandi Sabo Power)", symbols: ["VEDPOWER", "TSPL"], isin: "INE694L01019", ratio: 1, costFraction: 0.1223 },
      { name: "Vedanta Aluminium Metal — VAML", symbols: ["VAML"], ratio: 1, costFraction: 0.0715 },
      { name: "Vedanta Iron & Steel — VISL", symbols: ["VISL"], isin: "INE1CLE01013", ratio: 1, costFraction: 0.0679 },
    ],
    source: "Company cost-of-acquisition notice, 16 May 2026 (scheme effective 1 May 2026): Vedanta 52.34%, Vedanta Oil & Gas / Malco Energy 21.49%, Vedanta Power / Talwandi Sabo Power 12.23%, Vedanta Aluminium Metal 7.15%, Vedanta Iron & Steel 6.79%; 1 share of each per Vedanta share held on 1 May 2026.",
  },
];

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export interface HoldingQuantity {
  isin: string;
  symbol?: string;
  quantity: number;
  /** Zerodha's last price, used to check that a suspected split/bonus shows in the price. */
  lastPrice?: number;
  /** Zerodha's average cost per share; Zerodha adjusts it for bonuses and splits. */
  averagePrice?: number;
}

export type Suggestion =
  | {
      type: "split-bonus";
      id: string;
      instrumentId: string;
      symbol: string;
      ratio: number;
      /** The event happened between these two dates (inclusive window). */
      windowFrom: string;
      windowTo: string | null;
      reason: string;
      transaction: CanonicalTransaction;
    }
  | {
      type: "known-demerger";
      id: string;
      event: KnownDemerger;
      parentId: string;
      parentQuantity: number;
      /** For each child: the owner's instrument pre-selected (or null), how it was matched, and choices. */
      children: Array<{ index: number; preselected: string | null; matchedBy: "isin" | "symbol" | "quantity" | null }>;
      options: Array<{ instrumentId: string; label: string }>;
    }
  | {
      /** Quantities don't add up, but the evidence does NOT point to a split/bonus. No Apply button. */
      type: "unexplained";
      id: string;
      instrumentId: string;
      symbol: string;
      date: string | null;
      message: string;
    }
  | {
      type: "quantity-mismatch";
      id: string;
      instrumentId: string;
      symbol: string;
      tradesQuantity: number;
      zerodhaQuantity: number;
    }
  | {
      type: "missing-buys";
      id: string;
      instrumentId: string;
      symbol: string;
      /** Shares sold or held that have no earlier buy in the saved trades. */
      quantity: number;
      /** Suggested date for the entry: the day before the first sale/appearance. */
      beforeDate: string;
      firstSeen: string;
      reason: string;
    };

const EPS = 1e-6;
// Ordered roughly by how common they are in India (1:1 bonus, ₹10→₹2 split, ₹10→₹1 split, 1:2 bonus, …).
const COMMON_RATIOS = [2, 5, 10, 1.5, 3, 4, 1.25, 1.2, 1.1, 4 / 3, 5 / 3, 2.5, 6, 8, 20];

function day(iso: string): string {
  return iso.slice(0, 10);
}

function shiftIso(iso: string, deltaMs: number): string {
  return new Date(Date.parse(iso) + deltaMs).toISOString();
}

function previousDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function formatRatio(ratio: number): string {
  // Bonus a:b gives (a+b)/b units per unit; show the common forms.
  const bonus: Record<string, string> = { "2": "1:1 bonus or 1→2 split", "1.5": "1:2 bonus", "3": "2:1 bonus or 1→3 split", "1.25": "1:4 bonus", "1.2": "1:5 bonus", "1.1": "1:10 bonus", "5": "1→5 split (e.g. ₹10 → ₹2 face value)", "10": "1→10 split (e.g. ₹10 → ₹1 face value)" };
  const key = String(Math.round(ratio * 1000) / 1000);
  return bonus[key] ?? `×${key}`;
}

interface Simulation {
  ok: boolean;
  finalQuantity: number;
  /** Index of the first sale that exceeds the shares held. */
  firstOversell: number | null;
  /** Shares held just before the first oversell. */
  heldAtOversell: number;
}

/** Replays quantities only, optionally multiplying holdings by `ratio` just before transaction `at`. */
function simulate(rows: CanonicalTransaction[], ratio = 1, at = -1): Simulation {
  let held = 0;
  for (let index = 0; index <= rows.length; index += 1) {
    if (index === at) held *= ratio;
    if (index === rows.length) break;
    const row = rows[index]!;
    const quantity = row.quantity ?? 0;
    if (row.kind === "buy" || row.kind === "opening-balance") held += quantity;
    else if (row.kind === "sell") {
      if (quantity > held + EPS) return { ok: false, finalQuantity: held, firstOversell: index, heldAtOversell: held };
      held -= quantity;
    } else if ((row.kind === "split" || row.kind === "bonus") && row.ratio) held *= row.ratio;
  }
  return { ok: true, finalQuantity: held, firstOversell: null, heldAtOversell: held };
}

/**
 * Shares of a stock that are not explained by its own buys: sales bigger than what was
 * held, plus any extra shares Zerodha shows. New shares from a demerger look exactly like this.
 */
function unexplainedShares(rows: CanonicalTransaction[], zerodha: number | undefined): number {
  let needed = 0;
  let held = 0;
  for (const row of rows) {
    const quantity = row.quantity ?? 0;
    if (row.kind === "buy" || row.kind === "opening-balance") held += quantity;
    else if (row.kind === "sell") {
      if (quantity > held + EPS) {
        needed += quantity - held;
        held = 0;
      } else held -= quantity;
    } else if ((row.kind === "split" || row.kind === "bonus") && row.ratio) held *= row.ratio;
  }
  if (zerodha !== undefined && zerodha > held + EPS) needed += zerodha - held;
  return needed;
}

function priceOf(row: CanonicalTransaction | undefined): number | null {
  return row && (row.kind === "buy" || row.kind === "sell") && row.unitPrice ? row.unitPrice : null;
}

/** FIFO average cost per share of the shares still held (trade prices; splits/bonuses applied). */
function openAverage(rows: CanonicalTransaction[]): number | null {
  const lots: Array<{ quantity: number; price: number }> = [];
  for (const row of rows) {
    const quantity = row.quantity ?? 0;
    if ((row.kind === "buy" || row.kind === "opening-balance") && row.unitPrice) lots.push({ quantity, price: row.unitPrice });
    else if (row.kind === "opening-balance") return null;
    else if (row.kind === "sell") {
      let remaining = quantity;
      while (remaining > EPS && lots.length > 0) {
        const lot = lots[0]!;
        const used = Math.min(lot.quantity, remaining);
        lot.quantity -= used;
        remaining -= used;
        if (lot.quantity <= EPS) lots.shift();
      }
    } else if ((row.kind === "split" || row.kind === "bonus") && row.ratio) {
      for (const lot of lots) {
        lot.quantity *= row.ratio;
        lot.price /= row.ratio;
      }
    }
  }
  const held = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  return held > EPS ? lots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0) / held : null;
}

/**
 * Zerodha divides its average cost by the ratio after a bonus/split. So "your average cost ÷
 * Zerodha's average cost ≈ ratio" proves it, whatever the market did since. Returns null when
 * Zerodha's average isn't available.
 */
function averageCostEvidence(rows: CanonicalTransaction[], zerodhaAverage: number | undefined, ratio: number): boolean | null {
  const ours = openAverage(rows);
  if (!ours || !zerodhaAverage || zerodhaAverage <= 0) return null;
  return Math.abs(ours / zerodhaAverage / ratio - 1) < 0.12;
}

/** A real split/bonus divides the share price by about the ratio; trade prices must show that. */
function priceSupportsRatio(before: number | null, after: number | null, ratio: number): boolean {
  if (!before || !after) return false;
  const observed = before / after;
  return observed >= ratio / 1.6 && observed <= ratio * 1.6 && observed > 1.08;
}

export function analyseCorporateActions(
  transactions: CanonicalTransaction[],
  holdings: HoldingQuantity[] | null,
  dismissed: Set<string> = new Set(),
  knownNames: Map<string, string> = new Map(),
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const sorted = [...transactions].sort(stableTransactionSort);

  // Symbols known per instrument (from trades and holdings).
  const symbolOf = new Map<string, string>(knownNames);
  for (const row of sorted) if (row.instrumentId && row.symbol) symbolOf.set(row.instrumentId, row.symbol);
  for (const holding of holdings ?? []) if (holding.symbol) symbolOf.set(holding.isin, holding.symbol.toUpperCase());
  const label = (id: string) => symbolOf.get(id) ?? id;

  // Demerger children get shares (and cost) from the parent: treat them as acquisitions.
  const receivedFromDemerger = new Map<string, number>();
  for (const row of sorted) {
    if (row.kind !== "demerger" || !row.demerger) continue;
    for (const child of row.demerger.children) receivedFromDemerger.set(child.instrumentId, (receivedFromDemerger.get(child.instrumentId) ?? 0) + 1);
  }

  const rowsById = new Map<string, CanonicalTransaction[]>();
  for (const row of sorted) {
    if (!row.instrumentId || !["buy", "sell", "opening-balance", "split", "bonus"].includes(row.kind)) continue;
    const list = rowsById.get(row.instrumentId) ?? [];
    list.push(row);
    rowsById.set(row.instrumentId, list);
  }
  const holdingQty = new Map((holdings ?? []).map((holding) => [holding.isin, holding.quantity]));
  const ids = new Set<string>([...rowsById.keys(), ...holdingQty.keys()]);

  // Known demergers first (they explain "missing buys" of the new companies).
  const orphanIds = new Set<string>();
  for (const id of ids) {
    const rows = rowsById.get(id) ?? [];
    const sim = simulate(rows);
    const onlyHolding = rows.length === 0 && (holdingQty.get(id) ?? 0) > 0;
    if (onlyHolding || (!sim.ok && sim.heldAtOversell <= EPS)) orphanIds.add(id);
  }
  const appliedIds = new Set(sorted.map((row) => row.transactionId));
  const claimedChildren = new Set<string>();
  for (const event of KNOWN_DEMERGERS) {
    const suggestionId = `known:${event.id}`;
    if (appliedIds.has(suggestionId) || dismissed.has(suggestionId)) continue;
    const parentId = [...ids].find(
      (id) => event.parent.isins.includes(id) || event.parent.symbols.includes((symbolOf.get(id) ?? "").toUpperCase()),
    );
    if (!parentId) continue;
    const before = (rowsById.get(parentId) ?? []).filter((row) => day(row.occurredAt) < event.exDate);
    const held = simulate(before).finalQuantity;
    if (held <= EPS) continue;
    // Every stock can be chosen (new shares may have been topped up with later buys);
    // exact matches first, then stocks with unexplained quantities, then the rest by name.
    const isMatch = (id: string) =>
      event.children.some((child) => child.isin === id || child.symbols.includes(label(id).toUpperCase()));
    const rank = (id: string) => (isMatch(id) ? 0 : orphanIds.has(id) ? 1 : 2);
    const options = [...ids]
      .filter((id) => id !== parentId)
      .sort((a, b) => rank(a) - rank(b) || label(a).localeCompare(label(b)))
      .map((id) => ({ instrumentId: id, label: label(id) }));
    const taken = new Set<string>();
    const children: Array<{ index: number; preselected: string | null; matchedBy: "isin" | "symbol" | "quantity" | null }> =
      event.children.map((child, index) => {
        const byIsin = options.find((option) => child.isin && option.instrumentId === child.isin && !taken.has(option.instrumentId));
        const bySymbol = byIsin ? undefined : options.find((option) => child.symbols.includes(option.label.toUpperCase()) && !taken.has(option.instrumentId));
        const match = byIsin ?? bySymbol;
        if (match) taken.add(match.instrumentId);
        return { index, preselected: match?.instrumentId ?? null, matchedBy: byIsin ? "isin" : bySymbol ? "symbol" : null };
      });
    // Fallback: a stock with exactly the unexplained shares this demerger would have given,
    // first seen on/after the ex-date, and the only such stock.
    for (const entry of children) {
      if (entry.preselected) continue;
      const expected = held * event.children[entry.index]!.ratio;
      const candidates = [...ids].filter((id) => {
        if (id === parentId || taken.has(id)) return false;
        const rows = rowsById.get(id) ?? [];
        if (rows.length > 0 && day(rows[0]!.occurredAt) < event.exDate) return false;
        return Math.abs(unexplainedShares(rows, holdings === null ? undefined : holdingQty.get(id)) - expected) < EPS;
      });
      if (candidates.length === 1) {
        entry.preselected = candidates[0]!;
        entry.matchedBy = "quantity";
        taken.add(candidates[0]!);
      }
    }
    for (const entry of children) if (entry.preselected) claimedChildren.add(entry.preselected);
    suggestions.push({ type: "known-demerger", id: suggestionId, event, parentId, parentQuantity: held, children, options });
  }

  for (const id of ids) {
    const rows = rowsById.get(id) ?? [];
    const symbol = label(id);
    const zerodha = holdingQty.get(id);
    const base = simulate(rows);
    const fromDemerger = receivedFromDemerger.has(id) || claimedChildren.has(id);
    if (fromDemerger) continue; // explained (or about to be) by a demerger

    const consistent = base.ok && (zerodha === undefined || holdings === null || Math.abs(base.finalQuantity - zerodha) < EPS);
    if (consistent) continue;

    // Shares that appear without any earlier buy: bought before the files start, IPO, transfer, or a demerger.
    if (rows.length === 0 && zerodha !== undefined && zerodha > 0) {
      const suggestionId = `missing:${id}`;
      if (!dismissed.has(suggestionId)) {
        suggestions.push({
          type: "missing-buys",
          id: suggestionId,
          instrumentId: id,
          symbol,
          quantity: zerodha,
          beforeDate: previousDay(new Date().toISOString().slice(0, 10)),
          firstSeen: "in Zerodha holdings",
          reason: `Zerodha shows ${zerodha} ${symbol} shares, but your tradebook files have no purchase of them — most likely bought before your files start, an IPO allotment, a transfer, or shares from a bonus or demerger.`,
        });
      }
      continue;
    }
    if (!base.ok && base.heldAtOversell <= EPS) {
      const firstSale = rows[base.firstOversell!]!;
      // Quantity needed so that every later sale is covered, and Zerodha's holding matches.
      let needed = 0;
      let held = 0;
      for (const row of rows) {
        const quantity = row.quantity ?? 0;
        if (row.kind === "buy" || row.kind === "opening-balance") held += quantity;
        else if (row.kind === "sell") {
          if (quantity > held + EPS) {
            needed += quantity - held;
            held = 0;
          } else held -= quantity;
        } else if ((row.kind === "split" || row.kind === "bonus") && row.ratio) held *= row.ratio;
      }
      // Intraday: the sale was covered by buys later the SAME day (sell first, buy back).
      const saleDay = day(firstSale.occurredAt);
      const deficit = (firstSale.quantity ?? 0) - base.heldAtOversell;
      const boughtBackSameDay = rows
        .slice(base.firstOversell! + 1)
        .filter((row) => row.kind === "buy" && day(row.occurredAt) === saleDay)
        .reduce((sum, row) => sum + (row.quantity ?? 0), 0);
      if (boughtBackSameDay + EPS >= deficit) {
        const unexplainedId = `unexplained:${id}`;
        if (!dismissed.has(unexplainedId)) {
          suggestions.push({
            type: "unexplained",
            id: unexplainedId,
            instrumentId: id,
            symbol,
            date: saleDay,
            message: `On ${saleDay} you sold ${symbol} first and bought it back the same day — that's an intraday trade, not missing history. Intraday trades aren't matched separately yet, so this stock's figures stay hidden for now.`,
          });
        }
        continue;
      }

      const soldTotal = rows.filter((row) => row.kind === "sell").reduce((sum, row) => sum + (row.quantity ?? 0), 0);
      const laterBuys = rows.slice(base.firstOversell! + 1).filter((row) => row.kind === "buy");
      const laterBought = laterBuys.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
      const missingQuantity = Math.round(needed * 1e6) / 1e6;
      const after =
        laterBuys.length > 0
          ? ` Afterwards you bought ${laterBought} again (first on ${day(laterBuys[0]!.occurredAt)}).`
          : ` You haven't bought ${symbol} again since.`;
      const suggestionId = `missing:${id}`;
      if (!dismissed.has(suggestionId)) {
        suggestions.push({
          type: "missing-buys",
          id: suggestionId,
          instrumentId: id,
          symbol,
          quantity: missingQuantity,
          beforeDate: previousDay(saleDay),
          firstSeen: `first sale on ${saleDay}`,
          reason:
            `You sold ${firstSale.quantity} ${symbol} shares on ${saleDay}${soldTotal > (firstSale.quantity ?? 0) ? ` (${soldTotal} in total)` : ""}, but your tradebook files don't show when you bought ${missingQuantity} of them. ` +
            `You can only sell shares you already own, so they were most likely bought before your files start — or came from an IPO, a transfer, a bonus or a demerger.` +
            after,
        });
      }
      continue;
    }

    // Shares were held, but a later sale or Zerodha's holding needs a multiple: split/bonus.
    let feasible: Array<{ ratio: number; at: number; finalQuantity: number }> = [];
    for (const ratio of COMMON_RATIOS) {
      for (let at = 1; at <= rows.length; at += 1) {
        const heldBefore = simulate(rows.slice(0, at)).finalQuantity;
        if (heldBefore <= EPS) continue;
        const sim = simulate(rows, ratio, at);
        if (!sim.ok) continue;
        if (zerodha !== undefined && holdings !== null && Math.abs(sim.finalQuantity - zerodha) > EPS) continue;
        if (zerodha === undefined && holdings !== null && sim.finalQuantity > EPS) continue;
        feasible.push({ ratio, at, finalQuantity: sim.finalQuantity });
      }
    }
    let ratios = [...new Set(feasible.map((item) => item.ratio))];
    if (ratios.length > 1 && holdings === null) {
      // Holdings unknown: prefer a ratio that fits exactly (every share accounted for).
      const exact = feasible.filter((item) => Math.abs(item.finalQuantity) < EPS);
      const exactRatios = [...new Set(exact.map((item) => item.ratio))];
      if (exactRatios.length === 1) {
        feasible = exact;
        ratios = exactRatios;
      }
    }
    if (ratios.length > 1) {
      // Several ratios fit the quantities: keep only those the cost/price evidence supports.
      const holdingForEvidence = (holdings ?? []).find((item) => item.isin === id);
      // Strongest: an event after the last trade whose ratio Zerodha's adjusted average cost confirms.
      const confirmedByAverage = feasible.filter(
        (item) => item.at === rows.length && averageCostEvidence(rows, holdingForEvidence?.averagePrice, item.ratio) === true,
      );
      const confirmedRatios = [...new Set(confirmedByAverage.map((item) => item.ratio))];
      const supported = confirmedRatios.length === 1 ? confirmedByAverage : feasible.filter((item) => {
        const before = [...rows.slice(0, item.at)].reverse().map(priceOf).find((price) => price !== null) ?? null;
        if (item.at === rows.length) {
          return averageCostEvidence(rows, holdingForEvidence?.averagePrice, item.ratio) ?? priceSupportsRatio(before, holdingForEvidence?.lastPrice ?? null, item.ratio);
        }
        const after = rows.slice(item.at).map(priceOf).find((price) => price !== null) ?? null;
        return priceSupportsRatio(before, after, item.ratio);
      });
      const supportedRatios = [...new Set(supported.map((item) => item.ratio))];
      if (supportedRatios.length === 1) {
        feasible = supported;
        ratios = supportedRatios;
      }
    }
    if (ratios.length === 1) {
      const ratio = ratios[0]!;
      const positions = feasible.filter((item) => item.ratio === ratio).map((item) => item.at).sort((a, b) => a - b);
      const at = positions[positions.length - 1]!;
      const earliest = positions[0]!;
      const windowFrom = day(rows[earliest - 1]!.occurredAt);
      const windowTo = at < rows.length ? day(rows[at]!.occurredAt) : null;
      const occurredAt = at < rows.length ? shiftIso(rows[at]!.occurredAt, -1000) : shiftIso(rows[rows.length - 1]!.occurredAt, 1000);
      const suggestionId = `split:${id}:${ratio}:${day(occurredAt)}`;
      if (dismissed.has(suggestionId)) continue;

      // Evidence checks — a corporate action happens between trading days and moves the price.
      const sameDay = windowTo !== null && windowFrom === windowTo;
      const dayRows = windowTo ? rows.filter((row) => day(row.occurredAt) === windowTo) : [];
      const intraday = dayRows.some((row) => row.kind === "buy") && dayRows.some((row) => row.kind === "sell");
      const before = [...rows.slice(0, at)].reverse().map(priceOf).find((price) => price !== null) ?? null;
      const holding = (holdings ?? []).find((item) => item.isin === id);
      const zerodhaPrice = holding?.lastPrice ?? null;
      const after = at < rows.length ? rows.slice(at).map(priceOf).find((price) => price !== null) ?? null : zerodhaPrice;
      // Strongest evidence for shares still held after the event: Zerodha's adjusted average cost.
      const byAverage = at === rows.length ? averageCostEvidence(rows, holding?.averagePrice, ratio) : null;
      const evidence = byAverage ?? priceSupportsRatio(before, after, ratio);
      if (sameDay || intraday || !evidence) {
        const unexplainedId = `unexplained:${id}`;
        if (!dismissed.has(unexplainedId)) {
          suggestions.push({
            type: "unexplained",
            id: unexplainedId,
            instrumentId: id,
            symbol,
            date: windowTo,
            message:
              sameDay || intraday
                ? `On ${windowTo}, a sale was bigger than the ${symbol} shares held at that moment. This usually means intraday trades (sold before buying on the same day) or trades missing from your files — not a split or bonus.`
                : `${symbol}: your trades and Zerodha's quantity don't add up. The share prices don't show the drop a split or bonus causes, so it's more likely trades missing from your files (upload that period's tradebook) or shares moved in or out.`,
          });
        }
        continue;
      }
      suggestions.push({
        type: "split-bonus",
        id: suggestionId,
        instrumentId: id,
        symbol,
        ratio,
        windowFrom,
        windowTo,
        reason:
          (zerodha !== undefined && holdings !== null
            ? `Your trades add up to ${base.ok ? base.finalQuantity : "fewer"} shares but Zerodha shows ${zerodha}. A ${formatRatio(ratio)} explains it exactly.`
            : `A later sale is bigger than the shares bought. A ${formatRatio(ratio)} explains it exactly.`) +
          (byAverage
            ? ` Zerodha's average cost (₹${holding?.averagePrice?.toFixed(2)}) is your cost divided by ${ratio}, which confirms it.`
            : " The share price fell by about the same ratio, which confirms it."),
        transaction: {
          transactionId: suggestionId,
          kind: ratio === Math.round(ratio) && ratio >= 2 && [2, 5, 10].includes(ratio) ? "split" : "bonus",
          instrumentId: id,
          symbol,
          occurredAt,
          currency: "INR",
          ratio,
          note: `Detected from your data: ${formatRatio(ratio)} between ${windowFrom} and ${windowTo ?? "today"}.`,
          source: { fileName: "Your confirmation", rowNumber: 1 },
        },
      });
      continue;
    }

    if (!base.ok) {
      const firstSale = rows[base.firstOversell!]!;
      const unexplainedId = `unexplained:${id}`;
      if (!dismissed.has(unexplainedId)) {
        suggestions.push({
          type: "unexplained",
          id: unexplainedId,
          instrumentId: id,
          symbol,
          date: day(firstSale.occurredAt),
          message: `On ${day(firstSale.occurredAt)}, a ${symbol} sale was bigger than the shares held at that moment. Common causes: intraday trades (sold before buying the same day) or a missing tradebook period.`,
        });
      }
      continue;
    }

    if (zerodha !== undefined && holdings !== null && base.ok) {
      const suggestionId = `mismatch:${id}`;
      if (!dismissed.has(suggestionId)) {
        suggestions.push({ type: "quantity-mismatch", id: suggestionId, instrumentId: id, symbol, tradesQuantity: base.finalQuantity, zerodhaQuantity: zerodha });
      }
    }
  }
  return suggestions;
}

/** Builds the demerger transaction for a known event once the owner has matched the children. */
export function knownDemergerTransaction(event: KnownDemerger, parentId: string, childIds: string[]): CanonicalTransaction {
  return {
    transactionId: `known:${event.id}`,
    kind: "demerger",
    instrumentId: parentId,
    occurredAt: `${event.exDate}T00:00:00+05:30`,
    currency: "INR",
    demerger: {
      parentCostFraction: event.parentCostFraction,
      children: event.children.map((child, index) => ({
        instrumentId: childIds[index]!,
        ratio: child.ratio,
        costFraction: child.costFraction,
        symbol: child.name,
      })),
    },
    note: event.source,
    source: { fileName: "Your confirmation", rowNumber: 1 },
  };
}

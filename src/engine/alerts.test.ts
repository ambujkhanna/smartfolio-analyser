import { describe, expect, it } from "vitest";
import { buildAlerts, DEFAULT_ALERT_SETTINGS, type AlertInput } from "./alerts";
import { buildLedger } from "./buildLedger";
import { reconcileHoldings, type PnlPosition } from "./reconcileHoldings";
import type { CanonicalTransaction } from "../domain/transaction";

let row = 1;
function t(kind: "buy" | "sell", isin: string, date: string, quantity: number, price: number): CanonicalTransaction {
  return { transactionId: `a${row}`, kind, instrumentId: isin, occurredAt: `${date}T10:00:00+05:30`, currency: "INR", quantity, unitPrice: price, source: { fileName: "t", rowNumber: row++ } };
}

function setup(transactions: CanonicalTransaction[], holdings: Array<{ isin: string; symbol: string; quantity: number; last: number }>, extra: Partial<AlertInput> = {}): AlertInput {
  const ledger = buildLedger(transactions);
  const positions: PnlPosition[] = ledger.instruments.map((item) => ({
    instrumentId: item.instrumentId,
    openQuantity: item.openQuantity,
    openCostBasisTotal: item.openCostBasisTotal,
    lifecycle: item.realizedPnl === null || item.openCostBasisTotal === null ? null : {
      realizedPnl: item.realizedPnl,
      realizedGains: item.realizedGains,
      realizedLosses: item.realizedLosses,
      netInvested: item.buyOutflows - item.netSaleProceeds,
    },
  }));
  const rows = reconcileHoldings(
    holdings.map((holding) => ({ isin: holding.isin, tradingsymbol: holding.symbol, quantity: holding.quantity, average_price: 1, last_price: holding.last })),
    positions,
  ).rows;
  return {
    today: "2026-11-21",
    rows,
    ledger,
    transactions,
    rules: [],
    settings: DEFAULT_ALERT_SETTINGS,
    snapshots: [],
    health: { mismatches: 0, needsAnswer: 0, lastZerodhaSyncAt: "2026-11-20T09:00:00Z", lastBackupAt: "2026-11-15T09:00:00Z", hasSavedData: true, connected: true },
    ...extra,
  };
}

const A = "INE111A01011";
const B = "INE222B01012";

describe("buildAlerts", () => {
  // Owner's example: buy 10 @100, sell 4 @120, sell 6 @70, re-buy 10 @60 → break-even ₹70.
  const example = [t("buy", A, "2025-01-02", 10, 100), t("sell", A, "2025-02-02", 4, 120), t("sell", A, "2025-03-02", 6, 70), t("buy", A, "2025-04-02", 10, 60)];

  it("says when a stock has made back its past losses", () => {
    const alerts = buildAlerts(setup(example, [{ isin: A, symbol: "AAA", quantity: 10, last: 72 }]));
    expect(alerts.find((alert) => alert.category === "break-even")).toMatchObject({ id: `recovered:${A}`, tone: "good" });
  });

  it("says when a stock is close to break-even", () => {
    const alerts = buildAlerts(setup(example, [{ isin: A, symbol: "AAA", quantity: 10, last: 68 }]));
    expect(alerts.find((alert) => alert.category === "break-even")).toMatchObject({ id: `near-break-even:${A}`, tone: "info" });
  });

  it("flags shares turning long-term within 30 days while in profit", () => {
    const alerts = buildAlerts(setup([t("buy", B, "2025-12-01", 5, 100)], [{ isin: B, symbol: "BBB", quantity: 5, last: 150 }]));
    expect(alerts.find((alert) => alert.category === "tax")).toMatchObject({ id: `long-term:${B}:2026-12-02`, title: "5 BBB shares become long-term by 2026-12-02" });
  });

  it("flags losses before the financial year ends only in Feb–Mar", () => {
    const input = setup([t("buy", B, "2025-01-01", 20, 100)], [{ isin: B, symbol: "BBB", quantity: 20, last: 50 }]);
    expect(buildAlerts(input).some((alert) => alert.id.startsWith("harvest:"))).toBe(false);
    expect(buildAlerts({ ...input, today: "2027-02-15" }).some((alert) => alert.id === `harvest:${B}:2027-03-31`)).toBe(true);
  });

  it("warns on concentration above the limit", () => {
    const transactions = [t("buy", A, "2025-01-02", 10, 100), t("buy", B, "2025-01-02", 1, 100)];
    const alerts = buildAlerts(setup(transactions, [{ isin: A, symbol: "AAA", quantity: 10, last: 100 }, { isin: B, symbol: "BBB", quantity: 1, last: 100 }]));
    expect(alerts.filter((alert) => alert.category === "concentration").map((alert) => alert.symbol)).toEqual(["AAA"]);
  });

  it("fires the owner's own targets", () => {
    const input = setup([t("buy", B, "2025-01-02", 10, 100)], [{ isin: B, symbol: "BBB", quantity: 10, last: 80 }], {
      rules: [
        { id: "r1", instrumentId: B, kind: "below-real-average", value: 15 },
        { id: "r2", instrumentId: B, kind: "price-above", value: 120 },
      ],
    });
    const targets = buildAlerts(input).filter((alert) => alert.category === "target");
    expect(targets.map((alert) => alert.id)).toEqual(["target:r1"]);
  });

  it("reports recovery progress against about a month ago", () => {
    const input = setup(example, [{ isin: A, symbol: "AAA", quantity: 10, last: 60 }], {
      snapshots: [{ date: "2026-10-15", values: { [A]: 400 } }],
    });
    // Now: money still in 700, value 600 → ₹100 to recover (was ₹400).
    expect(buildAlerts(input).find((alert) => alert.category === "recovery")).toMatchObject({ tone: "good", title: "AAA: still to recover fell to ₹100.00" });
  });

  it("reminds about data health", () => {
    const input = setup(example, [{ isin: A, symbol: "AAA", quantity: 10, last: 60 }], {
      health: { mismatches: 2, needsAnswer: 1, lastZerodhaSyncAt: null, lastBackupAt: null, hasSavedData: true, connected: false },
    });
    const ids = buildAlerts(input).filter((alert) => alert.category === "data").map((alert) => alert.id);
    expect(ids).toEqual(["data:mismatch:2", "data:answers:1", "data:sync:2026-11", "data:backup:2026-11"]);
  });

  it("fires sold-stock conditions: below last sale price, back above original buy price", () => {
    const input = setup([t("buy", A, "2025-01-02", 1, 100)], [{ isin: A, symbol: "AAA", quantity: 1, last: 100 }], {
      rules: [
        { id: "s1", instrumentId: B, kind: "below-sale-price", value: 10 },
        { id: "s2", instrumentId: B, kind: "above-original-cost", value: 0 },
      ],
      sold: [{ instrumentId: B, label: "BBB", lastSalePrice: 200, averageBuyPrice: 250, price: 170 }],
    });
    expect(buildAlerts(input).filter((alert) => alert.category === "target").map((alert) => alert.id)).toEqual(["target:s1"]);
    const recovered = { ...input, sold: [{ instrumentId: B, label: "BBB", lastSalePrice: 200, averageBuyPrice: 250, price: 260 }] };
    expect(buildAlerts(recovered).filter((alert) => alert.category === "target").map((alert) => alert.id)).toEqual(["target:s2"]);
  });
});

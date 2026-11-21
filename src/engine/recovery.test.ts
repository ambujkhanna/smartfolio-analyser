import { describe, expect, it } from "vitest";
import { buildLedger } from "./buildLedger";
import { heldRecovery, rebuyZeroLossPrice, soldAtLoss } from "./recovery";
import type { ReconciledHolding } from "./reconcileHoldings";
import type { CanonicalTransaction } from "../domain/transaction";

let row = 1;
function t(kind: "buy" | "sell", isin: string, date: string, quantity: number, price: number): CanonicalTransaction {
  return { transactionId: `r${row}`, kind, instrumentId: isin, occurredAt: `${date}T10:00:00+05:30`, currency: "INR", quantity, unitPrice: price, source: { fileName: "t", rowNumber: row++ } };
}

describe("recovery tracker", () => {
  it("lists fully sold stocks with a net booked loss, with averages and last sale", () => {
    const transactions = [
      t("buy", "INE111A01011", "2024-01-10", 10, 250),
      t("sell", "INE111A01011", "2024-06-01", 6, 210),
      t("sell", "INE111A01011", "2024-09-01", 4, 200),
      t("buy", "INE222B01012", "2024-01-10", 5, 100),
      t("sell", "INE222B01012", "2024-02-10", 5, 130), // sold at a profit: not listed
    ];
    const items = soldAtLoss(buildLedger(transactions), transactions, (id) => (id === "INE111A01011" ? "AAA" : "BBB"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: "AAA", soldQuantity: 10, averageBuyPrice: 250, lastSaleDate: "2024-09-01", lastSalePrice: 200 });
    expect(items[0]!.netLoss).toBeCloseTo(2500 - (6 * 210 + 4 * 200));
    expect(items[0]!.averageSalePrice).toBeCloseTo(206);
  });

  it("computes the zero-loss price for a same-size re-buy", () => {
    // Loss ₹440 on 10 shares; re-buy 10 at ₹180 → must reach ₹224 to be back at zero.
    expect(rebuyZeroLossPrice(180, 440, 10)).toBeCloseTo(224);
  });

  it("sorts held losers by how close they are to zero loss", () => {
    const base = { symbols: [], exchanges: [], ledgerQuantity: 10, difference: 0, status: "matched", brokerAveragePrice: 1, brokerCostBasis: 1, ledgerAveragePrice: 1 } as const;
    const life = (breakEven: number, toRecover: number) => ({ realizedPnl: 0, profitBooked: 0, lossBooked: 0, lossCovered: 0, unrealizedPnl: 0, overallPnl: -toRecover, netInvested: 0, toRecover, breakEvenPrice: breakEven });
    const rows = [
      { ...base, isin: "A", symbols: ["FAR"], brokerQuantity: 10, brokerLastPrice: 50, lifecycle: life(100, 500) },
      { ...base, isin: "B", symbols: ["NEAR"], brokerQuantity: 10, brokerLastPrice: 95, lifecycle: life(100, 50) },
      { ...base, isin: "C", symbols: ["FINE"], brokerQuantity: 10, brokerLastPrice: 120, lifecycle: life(100, 0) },
    ] as unknown as ReconciledHolding[];
    const items = heldRecovery(rows);
    expect(items.map((item) => item.label)).toEqual(["NEAR", "FAR"]);
    expect(items[0]!.gapPercent).toBeCloseTo(5.263, 2);
  });
});

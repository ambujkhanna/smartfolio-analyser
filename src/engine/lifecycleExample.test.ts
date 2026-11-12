import { describe, expect, it } from "vitest";
import { buildLedger } from "./buildLedger";
import { reconcileHoldings } from "./reconcileHoldings";
import type { CanonicalTransaction } from "../domain/transaction";

const ID = "NSE:INE002A01018";
let row = 2;
function trade(kind: "buy" | "sell", quantity: number, unitPrice: number, day: string): CanonicalTransaction {
  return {
    transactionId: `t${row}`,
    kind,
    instrumentId: ID,
    occurredAt: `2026-${day}T10:00:00.000Z`,
    currency: "INR",
    quantity,
    unitPrice,
    source: { fileName: "trades.csv", rowNumber: row++ },
  };
}

// Owner's example: buy 10 @100, sell 4 @120, sell 6 @70, re-buy 10 @60, price now 60.
describe("lifecycle: buy, sell at profit, sell at loss, re-buy", () => {
  const ledger = buildLedger([
    trade("buy", 10, 100, "01-01"),
    trade("sell", 4, 120, "02-01"),
    trade("sell", 6, 70, "03-01"),
    trade("buy", 10, 60, "04-01"),
  ]);
  const item = ledger.instruments[0]!;

  it("separates profit booked and loss booked", () => {
    expect(item.realizedGains).toBeCloseTo(80);
    expect(item.realizedLosses).toBeCloseTo(180);
    expect(item.realizedPnl).toBeCloseTo(-100);
  });

  function lifecycleAt(lastPrice: number) {
    const result = reconcileHoldings(
      [{ isin: "INE002A01018", tradingsymbol: "RELIANCE", quantity: 10, average_price: 60, last_price: lastPrice }],
      [
        {
          instrumentId: ID,
          openQuantity: item.openQuantity,
          openCostBasisTotal: item.openCostBasisTotal,
          lifecycle: {
            realizedPnl: item.realizedPnl!,
            realizedGains: item.realizedGains,
            realizedLosses: item.realizedLosses,
            netInvested: item.buyOutflows - item.netSaleProceeds,
          },
        },
      ],
    );
    return result.rows[0]!.lifecycle!;
  }

  it("at ₹60: ₹100 still to recover, break-even ₹70", () => {
    const life = lifecycleAt(60);
    expect(life.unrealizedPnl).toBeCloseTo(0);
    expect(life.overallPnl).toBeCloseTo(-100);
    expect(life.lossCovered).toBeCloseTo(80);
    expect(life.toRecover).toBeCloseTo(100);
    expect(life.breakEvenPrice).toBeCloseTo(70);
  });

  it("at ₹65: current gain covers part of the remaining loss", () => {
    const life = lifecycleAt(65);
    expect(life.unrealizedPnl).toBeCloseTo(50);
    expect(life.lossCovered).toBeCloseTo(130);
    expect(life.toRecover).toBeCloseTo(50);
  });

  it("at ₹75: fully recovered", () => {
    const life = lifecycleAt(75);
    expect(life.lossCovered).toBeCloseTo(180);
    expect(life.toRecover).toBe(0);
    expect(life.overallPnl).toBeCloseTo(50);
  });
});

describe("one stock with missing history does not hide another stock's recovery", () => {
  it("keeps recovery for the complete stock", async () => {
    const { calculatePortfolioPnL } = await import("./calculatePortfolioPnL");
    const ledger = buildLedger([
      { ...trade("buy", 10, 100, "01-01") },
      { ...trade("sell", 5, 50, "02-01"), instrumentId: "NSE:INE075A01022" },
    ]);
    expect(ledger.errors.some((issue) => issue.code === "OVERSELL")).toBe(true);
    const pnl = calculatePortfolioPnL(ledger, {});
    const complete = pnl.instrumentMetrics.find((item) => item.instrumentId === ID)!;
    expect(complete.lifecycleRecoveryPrice).toBeCloseTo(100);
  });
});

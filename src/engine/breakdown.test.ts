import { describe, expect, it } from "vitest";
import { buildLedger, netInvestedFor } from "./buildLedger";
import { analyseCorporateActions, heldBefore } from "./corporateActions";
import type { CanonicalTransaction } from "../domain/transaction";

const ISIN = "INE777G01017";
let row = 1;
function entry(overrides: Partial<CanonicalTransaction>): CanonicalTransaction {
  return {
    transactionId: `b${row}`,
    kind: "buy",
    instrumentId: ISIN,
    symbol: "GEE",
    occurredAt: "2024-01-10T10:00:00+05:30",
    currency: "INR",
    source: { fileName: "test", rowNumber: row++ },
    ...overrides,
  };
}

describe("answers that explain a quantity difference", () => {
  it("transfer-out removes shares at cost, with no profit or loss", () => {
    const ledger = buildLedger([
      entry({ quantity: 10, unitPrice: 100 }),
      entry({ kind: "transfer-out", quantity: 4, occurredAt: "2024-05-01T15:30:00+05:30", source: { fileName: "Your confirmation", rowNumber: 1 } }),
    ]);
    const item = ledger.instruments[0]!;
    expect(ledger.errors).toHaveLength(0);
    expect(item.openQuantity).toBe(6);
    expect(item.openCostBasisTotal).toBeCloseTo(600);
    expect(item.realizedPnl).toBe(0);
    expect(netInvestedFor(item)).toBeCloseTo(600);
  });

  it("asks once when Zerodha shows fewer shares, and stops asking after the answer", () => {
    const trades = [entry({ quantity: 10, unitPrice: 100 })];
    const holdings = [{ isin: ISIN, symbol: "GEE", quantity: 6, averagePrice: 100 }];
    const before = analyseCorporateActions(trades, holdings);
    expect(before[0]).toMatchObject({ type: "quantity-mismatch", tradesQuantity: 10, zerodhaQuantity: 6 });
    const answered = [...trades, entry({ kind: "transfer-out", quantity: 4, occurredAt: "2024-05-01T15:30:00+05:30" })];
    expect(analyseCorporateActions(answered, holdings)).toHaveLength(0);
  });

  it("a two-line breakdown (IPO + bought before the files) covers a sale with no purchase record", () => {
    const trades = [entry({ kind: "sell", quantity: 15, unitPrice: 500, occurredAt: "2024-06-01T10:00:00+05:30" })];
    expect(analyseCorporateActions(trades, [])[0]).toMatchObject({ type: "missing-buys", quantity: 15 });
    const answered = [
      ...trades,
      entry({ kind: "opening-balance", quantity: 10, unitPrice: 300, occurredAt: "2021-07-19T00:00:00+05:30", note: "IPO allotment" }),
      entry({ kind: "opening-balance", quantity: 5, unitPrice: 350, occurredAt: "2022-01-05T00:00:00+05:30", note: "Bought before my tradebook files start" }),
    ];
    expect(analyseCorporateActions(answered, [])).toHaveLength(0);
    const ledger = buildLedger(answered);
    expect(ledger.instruments[0]!.realizedPnl).toBeCloseTo(15 * 500 - (10 * 300 + 5 * 350));
  });

  it("knows how many shares were held before a date (for bonus answers)", () => {
    const trades = [entry({ quantity: 10, unitPrice: 100 }), entry({ quantity: 5, unitPrice: 90, occurredAt: "2024-03-01T10:00:00+05:30" })];
    expect(heldBefore(trades, ISIN, "2024-02-01")).toBe(10);
    expect(heldBefore(trades, ISIN, "2024-03-02")).toBe(15);
  });
});

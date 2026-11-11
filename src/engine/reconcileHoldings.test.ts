import { describe, expect, it } from "vitest";
import { reconcileHoldings } from "./reconcileHoldings";

const RELIANCE = "INE002A01018";
const TCS = "INE467B01029";

describe("reconcileHoldings", () => {
  it("matches quantities by ISIN across exchange-qualified ledger IDs", () => {
    const result = reconcileHoldings(
      [{ isin: RELIANCE, tradingsymbol: "RELIANCE", exchange: "NSE", quantity: 10, t1_quantity: 0, average_price: 2500 }],
      [
        { instrumentId: `NSE:${RELIANCE}`, openQuantity: 6 },
        { instrumentId: `BSE:${RELIANCE}`, openQuantity: 4 },
      ],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ status: "matched", brokerQuantity: 10, ledgerQuantity: 10, difference: 0 });
    expect(result.unmatchedLedger).toHaveLength(0);
  });

  it("reports mismatches and holdings missing from the ledger without changing quantities", () => {
    const result = reconcileHoldings(
      [
        { isin: RELIANCE, quantity: 10, average_price: 2500 },
        { isin: TCS, quantity: 5, average_price: 3500 },
      ],
      [{ instrumentId: `NSE:${RELIANCE}`, openQuantity: 7 }],
    );
    const reliance = result.rows.find((row) => row.isin === RELIANCE);
    const tcs = result.rows.find((row) => row.isin === TCS);
    expect(reliance).toMatchObject({ status: "quantity-mismatch", difference: 3 });
    expect(tcs).toMatchObject({ status: "not-in-ledger", ledgerQuantity: null });
  });

  it("carries a quantity-weighted broker average price and cost basis", () => {
    const result = reconcileHoldings(
      [
        { isin: RELIANCE, exchange: "NSE", quantity: 2, t1_quantity: 1, average_price: 100 },
        { isin: RELIANCE, exchange: "BSE", quantity: 1, average_price: 140 },
      ],
      [],
    );
    expect(result.rows[0].brokerQuantity).toBe(4);
    expect(result.rows[0].brokerCostBasis).toBe(440);
    expect(result.rows[0].brokerAveragePrice).toBe(110);
  });

  it("leaves broker cost unavailable when any part has no valid average price", () => {
    const result = reconcileHoldings(
      [
        { isin: RELIANCE, quantity: 2, average_price: 100 },
        { isin: RELIANCE, quantity: 1, average_price: 0 },
      ],
      [],
    );
    expect(result.rows[0].brokerAveragePrice).toBeNull();
    expect(result.rows[0].brokerCostBasis).toBeNull();
  });

  it("lists open ledger positions that the broker does not hold", () => {
    const result = reconcileHoldings([], [
      { instrumentId: `NSE:${TCS}`, openQuantity: 3 },
      { instrumentId: "SYMBOL:UNKNOWN", openQuantity: 1 },
      { instrumentId: `NSE:${RELIANCE}`, openQuantity: 0 },
    ]);
    expect(result.unmatchedLedger.map((position) => position.instrumentId)).toEqual(["SYMBOL:UNKNOWN", `NSE:${TCS}`]);
  });
});

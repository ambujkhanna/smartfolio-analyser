import { describe, expect, it } from "vitest";
import { kiteTradesToTransactions, normalizeTradeId } from "./kiteTrades";
import { parseZerodhaTradebook } from "./zerodhaTradebook";
import { mergeTransactions } from "../lib/tradeStore";

const isins = new Map([["WIPRO", "INE075A01022"]]);

describe("kiteTradesToTransactions", () => {
  it("converts today's equity trades with the tradebook ID scheme", () => {
    const result = kiteTradesToTransactions(
      [
        { trade_id: "0055501", exchange: "NSE", tradingsymbol: "WIPRO", transaction_type: "BUY", quantity: 5, average_price: 250.5, fill_timestamp: "2026-11-12 10:15:30" },
        { trade_id: "77", exchange: "NFO", tradingsymbol: "NIFTY26NOVFUT", transaction_type: "SELL", quantity: 50, average_price: 24000, fill_timestamp: "2026-11-12 11:00:00" },
        { trade_id: "88", exchange: "NSE", tradingsymbol: "NEWCO", transaction_type: "BUY", quantity: 1, average_price: 10, fill_timestamp: "2026-11-12 11:00:00" },
      ],
      isins,
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      transactionId: "NSE:2026-11-12:55501",
      kind: "buy",
      instrumentId: "INE075A01022",
      occurredAt: "2026-11-12T10:15:30+05:30",
      quantity: 5,
      unitPrice: 250.5,
    });
    expect(result.unknownSymbols).toEqual([{ symbol: "NEWCO", exchange: "NSE" }]);
    expect(result.skipped).toBe(1);
  });

  it("is recognised as the same trade when the tradebook is uploaded later", () => {
    const fromKite = kiteTradesToTransactions(
      [{ trade_id: "0055501", exchange: "NSE", tradingsymbol: "WIPRO", transaction_type: "BUY", quantity: 5, average_price: 250.5, fill_timestamp: "2026-11-12 10:15:30" }],
      isins,
    ).transactions;
    const tradebook = parseZerodhaTradebook(
      [
        "symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time",
        "WIPRO,INE075A01022,2026-11-12,NSE,EQ,EQ,buy,false,5,250.5,55501,9001,2026-11-12T10:15:30",
      ].join("\n"),
      "tradebook.csv",
    )!;
    const { added } = mergeTransactions(fromKite, tradebook.transactions);
    expect(added).toBe(0);
  });

  it("drops leading zeros only from numeric trade IDs", () => {
    expect(normalizeTradeId("000123")).toBe("123");
    expect(normalizeTradeId("0")).toBe("0");
    expect(normalizeTradeId("AB012")).toBe("AB012");
  });
});

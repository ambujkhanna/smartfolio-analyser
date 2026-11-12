import { describe, expect, it } from "vitest";
import { verifyPortfolio } from "./verification";
import { parseZerodhaPnlCsv } from "../importers/zerodhaPnl";
import type { CanonicalTransaction } from "../domain/transaction";

let row = 1;
function t(kind: "buy" | "sell", isin: string, date: string, quantity: number, price: number): CanonicalTransaction {
  return {
    transactionId: `v${row}`,
    kind,
    instrumentId: isin,
    occurredAt: `${date}T10:00:00+05:30`,
    currency: "INR",
    quantity,
    unitPrice: price,
    source: { fileName: "test", rowNumber: row++ },
  };
}

const A = "INE111A01011";
const B = "INE222B01012";
const C = "INE333C01013";
const label = (id: string) => ({ [A]: "AAA", [B]: "BBB", [C]: "CCC" })[id] ?? id;

const statementCsv = (rows: string[]) =>
  [
    "Client ID,XX",
    "P&L Statement for Equity from 2025-04-01 to 2026-03-31",
    "Summary",
    "Charges,123.45",
    "Symbol,ISIN,Quantity,Buy Value,Sell Value,Realized P&L,Realized P&L Pct.,Previous Closing Price,Open Quantity,Open Quantity Type,Open Value,Unrealized P&L,Unrealized P&L Pct.",
    ...rows,
  ].join("\n");

describe("parseZerodhaPnlCsv", () => {
  it("reads the period, charges and per-stock rows", () => {
    const statement = parseZerodhaPnlCsv(statementCsv([`AAA,${A},5,500,600,100,20,110,5,LONG,500,50,10`]), "pnl.csv")!;
    expect(statement).toMatchObject({ from: "2025-04-01", to: "2026-03-31", charges: 123.45 });
    expect(statement.rows[0]).toMatchObject({ symbol: "AAA", isin: A, realized: 100, openQuantity: 5, openValue: 500 });
  });
});

describe("verifyPortfolio", () => {
  const transactions = [
    t("buy", A, "2025-01-10", 10, 100),
    t("sell", A, "2025-06-01", 5, 120), // +100 in FY 2025-26
    t("buy", B, "2025-02-01", 4, 50),
    t("buy", C, "2024-03-01", 2, 1000),
  ];

  it("verifies holdings by quantity and average cost, and flags a mismatch", () => {
    const result = verifyPortfolio({
      transactions,
      holdings: [
        { isin: A, symbol: "AAA", quantity: 5, averagePrice: 100 },
        { isin: B, symbol: "BBB", quantity: 4, averagePrice: 61 }, // Zerodha cost differs
        { isin: C, symbol: "CCC", quantity: 4, averagePrice: 500 }, // quantity differs
      ],
      statements: [],
      pendingIds: new Set([C]),
      labelOf: label,
    });
    expect(result.byId.get(A)!.status).toBe("verified");
    expect(result.byId.get(B)!.status).toBe("mismatch");
    expect(result.byId.get(C)!.status).toBe("needs-answer");
    expect(result.counts).toEqual({ verified: 1, "needs-answer": 1, mismatch: 1, unchecked: 0 });
  });

  it("checks booked profit and cost against a P&L statement", () => {
    const good = parseZerodhaPnlCsv(statementCsv([`AAA,${A},5,500,600,100,20,110,5,LONG,500,50,10`]), "pnl.csv")!;
    const ok = verifyPortfolio({ transactions, holdings: null, statements: [good], pendingIds: new Set(), labelOf: label });
    const a = ok.byId.get(A)!;
    expect(a.status).toBe("verified");
    expect(a.checks.map((check) => check.ok)).toEqual([true, true, true]);

    const bad = parseZerodhaPnlCsv(statementCsv([`AAA,${A},5,500,600,180,36,110,5,LONG,500,50,10`]), "pnl.csv")!;
    const wrong = verifyPortfolio({ transactions, holdings: null, statements: [bad], pendingIds: new Set(), labelOf: label });
    expect(wrong.byId.get(A)!.status).toBe("mismatch");
    expect(wrong.byId.get(A)!.checks[0]).toMatchObject({ ok: false, ours: 100, theirs: 180 });
  });

  it("marks stocks it cannot check as unchecked", () => {
    const result = verifyPortfolio({ transactions: [t("buy", A, "2020-01-01", 1, 10), t("sell", A, "2020-02-01", 1, 12)], holdings: null, statements: [], pendingIds: new Set(), labelOf: label });
    expect(result.byId.get(A)!.status).toBe("unchecked");
  });
});

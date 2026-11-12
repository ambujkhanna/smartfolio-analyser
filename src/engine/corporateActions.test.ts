import { describe, expect, it } from "vitest";
import { analyseCorporateActions, knownDemergerTransaction, KNOWN_DEMERGERS } from "./corporateActions";
import { buildLedger } from "./buildLedger";
import type { CanonicalTransaction } from "../domain/transaction";

let row = 1;
function t(kind: "buy" | "sell", isin: string, symbol: string, date: string, quantity: number, price: number): CanonicalTransaction {
  return {
    transactionId: `r${row}`,
    kind,
    instrumentId: isin,
    symbol,
    occurredAt: `${date}T10:00:00+05:30`,
    currency: "INR",
    quantity,
    unitPrice: price,
    source: { fileName: "test", rowNumber: row++ },
  };
}

describe("analyseCorporateActions", () => {
  it("finds a 1:1 bonus from a sale larger than the shares bought", () => {
    const rows = [t("buy", "INE111A01011", "ABC", "2024-01-10", 10, 200), t("sell", "INE111A01011", "ABC", "2024-08-01", 20, 110)];
    const found = analyseCorporateActions(rows, null);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ type: "split-bonus", ratio: 2, windowFrom: "2024-01-10", windowTo: "2024-08-01" });
    if (found[0]!.type !== "split-bonus") return;
    const ledger = buildLedger([...rows, found[0]!.transaction]);
    expect(ledger.errors).toHaveLength(0);
    expect(ledger.instruments[0]!.realizedPnl).toBeCloseTo(2200 - 2000);
  });

  it("finds a 1→5 split from Zerodha's holding", () => {
    const rows = [t("buy", "INE222B01012", "XYZ", "2023-03-01", 4, 1000)];
    const found = analyseCorporateActions(rows, [{ isin: "INE222B01012", symbol: "XYZ", quantity: 20 }]);
    expect(found[0]).toMatchObject({ type: "split-bonus", ratio: 5, windowTo: null });
  });

  it("asks for the cost when shares were sold without any earlier buy", () => {
    const rows = [t("sell", "INE333C01013", "OLDCO", "2023-05-02", 30, 50)];
    const found = analyseCorporateActions(rows, []);
    expect(found[0]).toMatchObject({ type: "missing-buys", quantity: 30, beforeDate: "2023-05-01" });
  });

  it("asks for the cost of holdings with no trades at all", () => {
    const found = analyseCorporateActions([], [{ isin: "INE444D01014", symbol: "IPOCO", quantity: 15 }]);
    expect(found[0]).toMatchObject({ type: "missing-buys", quantity: 15 });
  });

  it("suggests the verified Tata Motors demerger and matches TMCV", () => {
    const rows = [
      t("buy", "INE155A01022", "TATAMOTORS", "2025-02-01", 50, 700),
      t("sell", "INE155A01022", "TMPV", "2025-11-03", 50, 400),
      t("sell", "INE1TAE01010", "TMCV", "2025-11-20", 50, 300),
    ];
    const found = analyseCorporateActions(rows, []);
    const demerger = found.find((item) => item.type === "known-demerger");
    expect(demerger).toBeTruthy();
    if (demerger?.type !== "known-demerger") return;
    expect(demerger.parentQuantity).toBe(50);
    expect(demerger.children[0]!.preselected).toBe("INE1TAE01010");
    // TMCV is explained by the demerger, so it isn't also reported as missing buys.
    expect(found.some((item) => item.type === "missing-buys")).toBe(false);

    const event = KNOWN_DEMERGERS.find((item) => item.id === "tata-motors-2025")!;
    const ledger = buildLedger([...rows, knownDemergerTransaction(event, "INE155A01022", ["INE1TAE01010"])]);
    expect(ledger.errors).toHaveLength(0);
    const total = ledger.instruments.reduce((sum, item) => sum + (item.realizedPnl ?? 0), 0);
    expect(total).toBeCloseTo(50 * 400 + 50 * 300 - 50 * 700);
    // After applying, nothing is suggested any more.
    expect(analyseCorporateActions([...rows, knownDemergerTransaction(event, "INE155A01022", ["INE1TAE01010"])], [])).toHaveLength(0);
  });

  it("respects dismissed suggestions", () => {
    const rows = [t("sell", "INE555E01015", "GIFTCO", "2023-05-02", 5, 50)];
    expect(analyseCorporateActions(rows, [], new Set(["missing:INE555E01015"]))).toHaveLength(0);
  });

  it("offers new companies that were later topped up with buys (Vedanta → VOGL etc.)", () => {
    const rows = [
      t("buy", "INE205A01025", "VEDL", "2026-02-01", 2, 450),
      t("buy", "INE704J01044", "VOGL", "2026-06-10", 78, 41),
      t("buy", "INE694L01019", "VEDPOWER", "2026-06-10", 1, 46),
      t("buy", "INE205A01025", "VEDL", "2026-06-11", 6, 260),
    ];
    const holdings = [
      { isin: "INE205A01025", symbol: "VEDL", quantity: 8 },
      { isin: "INE704J01044", symbol: "VOGL", quantity: 80 },
      { isin: "INE694L01019", symbol: "VEDPOWER", quantity: 3 },
      { isin: "INE999Z01011", symbol: "VAML", quantity: 2 },
      { isin: "INE1CLE01013", symbol: "VISL", quantity: 2 },
    ];
    const found = analyseCorporateActions(rows, holdings);
    const demerger = found.find((item) => item.type === "known-demerger");
    if (demerger?.type !== "known-demerger") throw new Error("no demerger suggestion");
    expect(demerger.parentQuantity).toBe(2);
    expect(demerger.children.map((child) => child.preselected)).toEqual(["INE704J01044", "INE694L01019", "INE999Z01011", "INE1CLE01013"]);
    expect(demerger.options[0]!.label).toMatch(/VOGL|VEDPOWER|VAML|VISL/);
    // The new companies are explained by the demerger, not reported separately.
    expect(found.filter((item) => item.type !== "known-demerger")).toHaveLength(0);

    const event = KNOWN_DEMERGERS.find((item) => item.id === "vedanta-2026")!;
    const applied = [...rows, knownDemergerTransaction(event, "INE205A01025", demerger.children.map((child) => child.preselected!))];
    expect(analyseCorporateActions(applied, holdings)).toHaveLength(0);
    const ledger = buildLedger(applied);
    const vogl = ledger.instruments.find((item) => item.instrumentId === "INE704J01044")!;
    expect(vogl.openQuantity).toBe(80);
    expect(vogl.openCostBasisTotal).toBeCloseTo(78 * 41 + 2 * 450 * 0.2149);
  });
});

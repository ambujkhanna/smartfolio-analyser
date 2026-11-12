import { describe, expect, it } from "vitest";
import { buildLedger, netInvestedFor } from "./buildLedger";
import { validateTransaction, type CanonicalTransaction } from "../domain/transaction";

const PARENT = "INE155A01022";
const CHILD = "INE1TAE01010";
let row = 1;
const base = (overrides: Partial<CanonicalTransaction>): CanonicalTransaction => ({
  transactionId: `t${row}`,
  kind: "buy",
  instrumentId: PARENT,
  occurredAt: "2025-01-10T10:00:00+05:30",
  currency: "INR",
  source: { fileName: "test", rowNumber: row++ },
  ...overrides,
});

const demerger = base({
  transactionId: "demerger-tata-2025",
  kind: "demerger",
  occurredAt: "2025-10-14T00:00:00+05:30",
  demerger: { parentCostFraction: 0.6885, children: [{ instrumentId: CHILD, ratio: 1, costFraction: 0.3115 }] },
});

describe("demerger (Tata Motors 2025: 1 TMCV per share, cost 68.85% / 31.15%)", () => {
  it("validates the terms", () => {
    expect(validateTransaction(demerger).status).toBe("valid");
    const bad = { ...demerger, demerger: { parentCostFraction: 0.6, children: [{ instrumentId: CHILD, ratio: 1, costFraction: 0.3 }] } };
    expect(validateTransaction(bad).status).toBe("invalid");
  });

  it("moves cost to the new company and fixes the parent's booked loss", () => {
    const ledger = buildLedger([
      base({ quantity: 100, unitPrice: 660 }),
      demerger,
      base({ kind: "sell", quantity: 100, unitPrice: 400, occurredAt: "2025-11-01T10:00:00+05:30" }),
    ]);
    expect(ledger.errors).toHaveLength(0);
    const parent = ledger.instruments.find((item) => item.instrumentId === PARENT)!;
    const child = ledger.instruments.find((item) => item.instrumentId === CHILD)!;
    // Without the demerger this sale would book 40,000 − 66,000 = −26,000.
    expect(parent.realizedPnl).toBeCloseTo(40000 - 66000 * 0.6885);
    expect(child.openQuantity).toBe(100);
    expect(child.openCostBasisTotal).toBeCloseTo(66000 * 0.3115);
    expect(netInvestedFor(child)).toBeCloseTo(66000 * 0.3115);
    expect(netInvestedFor(parent)).toBeCloseTo(66000 * 0.6885 - 40000);
    // The total across both companies is unchanged.
    expect(netInvestedFor(parent) + netInvestedFor(child)).toBeCloseTo(66000 - 40000);
  });

  it("lets later sales of the new company use the moved cost", () => {
    const ledger = buildLedger([
      base({ quantity: 10, unitPrice: 600 }),
      demerger,
      base({ kind: "sell", instrumentId: CHILD, quantity: 10, unitPrice: 300, occurredAt: "2025-11-20T10:00:00+05:30" }),
    ]);
    expect(ledger.errors).toHaveLength(0);
    const child = ledger.instruments.find((item) => item.instrumentId === CHILD)!;
    expect(child.realizedPnl).toBeCloseTo(3000 - 6000 * 0.3115);
  });
});

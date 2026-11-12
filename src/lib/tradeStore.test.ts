import { describe, expect, it } from "vitest";
import { dateRange, fromBackup, mergeTransactions, toBackup, EMPTY_HISTORY } from "./tradeStore";
import type { CanonicalTransaction } from "../domain/transaction";

function trade(id: string, day: string): CanonicalTransaction {
  return {
    transactionId: id,
    kind: "buy",
    instrumentId: "INE075A01022",
    occurredAt: `2026-${day}T10:00:00+05:30`,
    currency: "INR",
    quantity: 1,
    unitPrice: 100,
    source: { fileName: "tradebook.xlsx", rowNumber: 2 },
  };
}

describe("tradeStore", () => {
  it("adds only trades not already saved", () => {
    const { merged, added } = mergeTransactions([trade("a", "01-01")], [trade("a", "01-01"), trade("b", "02-01")]);
    expect(added).toBe(1);
    expect(merged.map((item) => item.transactionId)).toEqual(["a", "b"]);
  });

  it("reports the saved date range", () => {
    expect(dateRange([trade("b", "03-05"), trade("a", "01-02")])).toEqual({ from: "2026-01-02", to: "2026-03-05" });
    expect(dateRange([])).toBeNull();
  });

  it("round-trips a backup and rejects foreign or damaged files", () => {
    const text = toBackup({ ...EMPTY_HISTORY, transactions: [trade("a", "01-01")] });
    const restored = fromBackup(text);
    expect(typeof restored).not.toBe("string");
    if (typeof restored !== "string") expect(restored.transactions).toHaveLength(1);
    expect(typeof fromBackup("not json")).toBe("string");
    expect(typeof fromBackup(JSON.stringify({ app: "other", transactions: [] }))).toBe("string");
    const damaged = JSON.parse(text);
    damaged.transactions[0].quantity = -5;
    expect(fromBackup(JSON.stringify(damaged))).toMatch(/damaged/);
  });
});

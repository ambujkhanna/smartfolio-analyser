import { describe, expect, it } from "vitest";
import { formatINR } from "./formatMoney";

describe("formatINR", () => {
  it("formats a finite amount as Indian rupees", () => {
    expect(formatINR(123456.5)).toBe("₹1,23,456.50");
  });

  it("keeps a genuine zero distinct from missing data", () => {
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(null)).toBe("Unavailable");
    expect(formatINR(undefined)).toBe("Unavailable");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite value %s",
    (value) => {
      expect(formatINR(value)).toBe("Unavailable");
    },
  );
});

import { describe, expect, it } from "vitest";
import { isValidAccessKey } from "./accessControl";

const validKey = "a".repeat(64);

describe("isValidAccessKey", () => {
  it("accepts an exact long key", () => {
    expect(isValidAccessKey(validKey, validKey)).toBe(true);
  });

  it("rejects missing, short, and mismatched keys", () => {
    expect(isValidAccessKey(undefined, validKey)).toBe(false);
    expect(isValidAccessKey(validKey, undefined)).toBe(false);
    expect(isValidAccessKey("short", "short")).toBe(false);
    expect(isValidAccessKey("b".repeat(64), validKey)).toBe(false);
  });
});

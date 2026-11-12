import { describe, expect, it } from "vitest";
import { normalizeCode, accessToken, hasSiteAccess, readCookie, safeNextPath } from "./siteAccess";

describe("siteAccess", () => {
  it("derives a stable token that does not contain the code", async () => {
    const token = await accessToken("correct horse battery staple");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).toBe(await accessToken("correct horse battery staple"));
    expect(token).not.toContain("horse");
  });

  it("accepts only the matching cookie", async () => {
    const token = await accessToken("code-one");
    expect(await hasSiteAccess(token, "code-one")).toBe(true);
    expect(await hasSiteAccess(token, "code-two")).toBe(false);
    expect(await hasSiteAccess(undefined, "code-one")).toBe(false);
  });

  it("reads a named cookie from a header", () => {
    expect(readCookie("a=1; smartfolio_access=abc; b=2", "smartfolio_access")).toBe("abc");
    expect(readCookie(null, "x")).toBeUndefined();
  });

  it("only allows same-site relative redirects", () => {
    expect(safeNextPath("/?zerodha=connected")).toBe("/?zerodha=connected");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });

  it("ignores pasted whitespace, newlines and surrounding quotes", async () => {
    const token = await accessToken("mango-river-quiet-lamp-42");
    expect(await hasSiteAccess(token, "mango-river-quiet-lamp-42\r\n")).toBe(true);
    expect(await hasSiteAccess(token, "  \"mango-river-quiet-lamp-42\" ")).toBe(true);
    expect(await hasSiteAccess(token, "Mango-river-quiet-lamp-42")).toBe(false);
    expect(normalizeCode("  ")).toBe("");
  });
});

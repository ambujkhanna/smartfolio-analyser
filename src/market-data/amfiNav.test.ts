import { describe, expect, it } from "vitest";
import { getAmfiNavQuote, parseAmfiNavText } from "./amfiNav";
import type { InstrumentRecord } from "../domain/instrument";

const nowMs = Date.parse("2026-10-29T10:00:00.000Z");

const mutualFund: InstrumentRecord = {
  instrumentId: "MF:120586",
  displayName: "Example Direct Growth",
  assetType: "mutual-fund",
  currency: "INR",
  amfiSchemeCode: "120586",
  isin: "INF109K01480",
};

describe("parseAmfiNavText", () => {
  it("parses the current 8-column format and skips section headings", () => {
    const parsed = parseAmfiNavText(
      "Open Ended Schemes(Equity)\n120586;INF109K01480;-;Example Fund;Direct;Growth;123.4567;28-Oct-2026",
    );
    expect(parsed.acceptedCount).toBe(1);
    expect(parsed.records[0]).toMatchObject({
      schemeCode: "120586",
      schemeName: "Example Fund",
      plan: "Direct",
      option: "Growth",
      nav: 123.4567,
      valuationDate: "2026-10-28",
      format: "current-8-column",
    });
  });

  it("parses the legacy 6-column layout without confusing NAV/date offsets", () => {
    const parsed = parseAmfiNavText(
      "120586;INF109K01480;-;Example Fund;123.4567;28-Oct-2026",
    );
    expect(parsed.records[0].nav).toBe(123.4567);
    expect(parsed.records[0].valuationDate).toBe("2026-10-28");
    expect(parsed.records[0].format).toBe("legacy-6-column");
  });

  it("rejects invalid NAV, date, and unsupported row layouts", () => {
    const parsed = parseAmfiNavText([
      "120586;INF109K01480;-;Bad NAV;0;28-Oct-2026",
      "120587;INF109K01481;-;Bad Date;10;31-Feb-2026",
      "120588;too;few",
    ].join("\n"));
    expect(parsed.records).toHaveLength(0);
    expect(parsed.issues.map((issue) => issue.code)).toContain("INVALID_NAV");
    expect(parsed.issues.map((issue) => issue.code)).toContain("INVALID_NAV_DATE");
    expect(parsed.issues.map((issue) => issue.code)).toContain("UNSUPPORTED_NAV_ROW_FORMAT");
  });
});

describe("getAmfiNavQuote", () => {
  it("returns a NAV quote with scheme/date provenance", () => {
    const parsed = parseAmfiNavText(
      "120586;INF109K01480;-;Example Fund;Direct;Growth;123.4567;29-Oct-2026",
    );
    const result = getAmfiNavQuote(mutualFund, parsed.records, {
      nowMs,
      maxAgeMs: 3 * 24 * 60 * 60 * 1000,
    });
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.quote.price).toBe(123.4567);
      expect(result.quote.quoteType).toBe("nav");
      expect(result.quote.valuationDate).toBe("2026-10-29");
      expect(result.quote.providerInstrumentId).toBe("120586");
    }
  });

  it("keeps ambiguous ISIN mappings unresolved", () => {
    const parsed = parseAmfiNavText([
      "120586;INF109K01480;-;Example Fund;Direct;Growth;123.4567;29-Oct-2026",
      "120587;INF109K01480;-;Other Fund;Direct;Growth;12.3456;29-Oct-2026",
    ].join("\n"));
    const result = getAmfiNavQuote(
      { ...mutualFund, amfiSchemeCode: undefined },
      parsed.records,
      { nowMs, maxAgeMs: 3 * 24 * 60 * 60 * 1000 },
    );
    expect(result.status).toBe("mismatched");
  });

  it("rejects use for non-mutual-fund instruments", () => {
    const parsed = parseAmfiNavText(
      "120586;INF109K01480;-;Example Fund;Direct;Growth;123.4567;29-Oct-2026",
    );
    const result = getAmfiNavQuote(
      { ...mutualFund, assetType: "equity" },
      parsed.records,
      { nowMs, maxAgeMs: 3 * 24 * 60 * 60 * 1000 },
    );
    expect(result.status).toBe("mismatched");
  });
});

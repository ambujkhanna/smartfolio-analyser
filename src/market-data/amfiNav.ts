import type { InstrumentRecord } from "../domain/instrument";
import { validateQuote, type QuoteValidation } from "../domain/quote";

export interface AmfiNavRecord {
  schemeCode: string;
  isinPrimary?: string;
  isinReinvestment?: string;
  schemeName: string;
  plan?: string;
  option?: string;
  nav: number;
  valuationDate: string;
  format: "current-8-column" | "legacy-6-column";
  sourceLine: number;
}

export interface AmfiNavIssue {
  lineNumber?: number;
  code: string;
  message: string;
}

export interface AmfiNavParseResult {
  records: AmfiNavRecord[];
  issues: AmfiNavIssue[];
  acceptedCount: number;
  rejectedCount: number;
  isComplete: boolean;
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function cleanIsin(value: string | undefined): string | undefined {
  const cleaned = (value ?? "").trim().toUpperCase();
  return cleaned && cleaned !== "-" ? cleaned : undefined;
}

function parseAmfiDate(value: string): string | undefined {
  const match = value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return undefined;

  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const month = months[match[2].toUpperCase()];
  if (month === undefined) return undefined;

  const day = Number(match[1]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Parses AMFI's current 8-column NAVAll format and retains compatibility with
 * the older 6-column format for archived fixtures. Unknown/malformed data rows
 * are reported rather than interpreted using guessed column offsets.
 */
export function parseAmfiNavText(text: string): AmfiNavParseResult {
  const records: AmfiNavRecord[] = [];
  const issues: AmfiNavIssue[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const fields = line.split(";");
    const schemeCode = (fields[0] ?? "").trim();

    // AMFI feed includes AMC and section headings that are not NAV data rows.
    if (!/^\d+$/.test(schemeCode)) return;

    if (fields.length !== 8 && fields.length !== 6) {
      issues.push({
        lineNumber: index + 1,
        code: "UNSUPPORTED_NAV_ROW_FORMAT",
        message: `Scheme row has ${fields.length} columns; expected current 8-column or legacy 6-column format.`,
      });
      return;
    }

    const isCurrentFormat = fields.length === 8;
    const schemeName = (fields[3] ?? "").trim();
    const navText = (fields[isCurrentFormat ? 6 : 4] ?? "").trim();
    const dateText = (fields[isCurrentFormat ? 7 : 5] ?? "").trim();
    const nav = Number(navText);
    const valuationDate = parseAmfiDate(dateText);

    if (!schemeName) {
      issues.push({ lineNumber: index + 1, code: "MISSING_SCHEME_NAME", message: "NAV row has no scheme name." });
      return;
    }
    if (!Number.isFinite(nav) || nav <= 0) {
      issues.push({ lineNumber: index + 1, code: "INVALID_NAV", message: "NAV must be a finite positive number." });
      return;
    }
    if (!valuationDate) {
      issues.push({ lineNumber: index + 1, code: "INVALID_NAV_DATE", message: "NAV valuation date is missing or invalid." });
      return;
    }

    records.push({
      schemeCode,
      isinPrimary: cleanIsin(fields[1]),
      isinReinvestment: cleanIsin(fields[2]),
      schemeName,
      ...(isCurrentFormat && fields[4]?.trim() ? { plan: fields[4].trim() } : {}),
      ...(isCurrentFormat && fields[5]?.trim() ? { option: fields[5].trim() } : {}),
      nav,
      valuationDate,
      format: isCurrentFormat ? "current-8-column" : "legacy-6-column",
      sourceLine: index + 1,
    });
  });

  if (records.length === 0) {
    issues.push({ code: "NO_NAV_RECORDS", message: "No valid AMFI NAV records were found in the supplied text." });
  }

  return {
    records,
    issues,
    acceptedCount: records.length,
    rejectedCount: issues.filter((issue) => issue.lineNumber !== undefined).length,
    isComplete: issues.length === 0 && records.length > 0,
  };
}

/**
 * Resolves a mutual-fund instrument to an exact AMFI scheme and validates its NAV.
 * A scheme code is preferred; ISIN fallback is allowed only when it identifies one scheme.
 */
export function getAmfiNavQuote(
  instrument: InstrumentRecord,
  records: readonly AmfiNavRecord[],
  options: { nowMs?: number; maxAgeMs: number },
): QuoteValidation {
  if (instrument.assetType !== "mutual-fund") {
    return { status: "mismatched", reason: "AMFI NAV can only value a mutual-fund instrument." };
  }

  let matches: AmfiNavRecord[] = [];
  if (instrument.amfiSchemeCode?.trim()) {
    matches = records.filter((record) => record.schemeCode === instrument.amfiSchemeCode);
    if (matches.length === 0) {
      return { status: "unavailable", reason: "No AMFI NAV record matched the configured scheme code." };
    }
  } else if (instrument.isin?.trim()) {
    const isin = normalize(instrument.isin);
    matches = records.filter(
      (record) => normalize(record.isinPrimary) === isin || normalize(record.isinReinvestment) === isin,
    );
    const schemeCodes = new Set(matches.map((record) => record.schemeCode));
    if (schemeCodes.size > 1) {
      return { status: "mismatched", reason: "ISIN maps to multiple AMFI schemes; an exact scheme code is required." };
    }
    if (matches.length === 0) {
      return { status: "unavailable", reason: "No AMFI NAV record matched the configured ISIN." };
    }
  } else {
    return { status: "unavailable", reason: "Mutual-fund scheme code or ISIN is required to resolve NAV." };
  }

  const latestDate = matches.reduce(
    (latest, record) => (record.valuationDate > latest ? record.valuationDate : latest),
    "",
  );
  const latestRecords = matches.filter((record) => record.valuationDate === latestDate);
  const distinctValues = new Set(latestRecords.map((record) => record.nav));
  if (distinctValues.size > 1) {
    return { status: "mismatched", reason: "AMFI returned conflicting NAV values for the same scheme and date." };
  }

  const record = latestRecords[0];
  if (!record) {
    return { status: "unavailable", reason: "No AMFI NAV record is available for this scheme." };
  }

  const nowMs = options.nowMs ?? Date.now();
  const quote = {
    instrumentId: instrument.instrumentId,
    price: record.nav,
    currency: "INR",
    source: "AMFI NAV download",
    quoteType: "nav" as const,
    observedAt: new Date(record.valuationDate + "T00:00:00.000Z").toISOString(),
    valuationDate: record.valuationDate,
    retrievedAt: new Date(nowMs).toISOString(),
    providerInstrumentId: record.schemeCode,
  };

  return validateQuote(quote, instrument.instrumentId, {
    nowMs,
    maxAgeMs: options.maxAgeMs,
    expectedCurrency: instrument.currency,
  });
}

import { gunzipSync } from "node:zlib";
import type { AssetType, Exchange, InstrumentRecord } from "../domain/instrument";

export const UPSTOX_INSTRUMENT_MASTER_URL =
  "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";

export interface InstrumentMasterIssue {
  index?: number;
  code: string;
  message: string;
}

export interface InstrumentMasterParseResult {
  instruments: InstrumentRecord[];
  issues: InstrumentMasterIssue[];
  isComplete: boolean;
}

export type InstrumentMasterLoadResult =
  | {
      status: "available";
      result: InstrumentMasterParseResult;
      retrievedAt: string;
    }
  | {
      status: "unavailable";
      reason: string;
    };

export interface InstrumentMasterLoadOptions {
  fetcher?: typeof fetch;
  nowMs?: number;
  cacheTtlMs?: number;
  /** Disable module cache for deterministic tests or explicit refreshes. */
  useCache?: boolean;
}

interface CachedMaster {
  expiresAt: number;
  result: InstrumentMasterParseResult;
  retrievedAt: string;
}

let cachedMaster: CachedMaster | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function parseJsonText(bytes: Uint8Array): string {
  try {
    return gunzipSync(Buffer.from(bytes)).toString("utf8");
  } catch {
    // Some fetch implementations automatically decompress HTTP responses.
    return Buffer.from(bytes).toString("utf8");
  }
}

/**
 * Parses Upstox's documented JSON BOD instrument master. Only listed NSE/BSE
 * cash-equity segment records are retained; derivatives and unrelated segments
 * are intentionally ignored by this first version.
 */
export function parseUpstoxInstrumentMaster(text: string): InstrumentMasterParseResult {
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return {
      instruments: [],
      issues: [{ code: "INVALID_MASTER_JSON", message: "Upstox instrument master is not valid JSON." }],
      isComplete: false,
    };
  }

  const rows = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : null;

  if (!rows) {
    return {
      instruments: [],
      issues: [{ code: "INVALID_MASTER_SHAPE", message: "Expected an array of instrument records." }],
      isComplete: false,
    };
  }

  const instruments: InstrumentRecord[] = [];
  const issues: InstrumentMasterIssue[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      issues.push({ index, code: "INVALID_MASTER_ROW", message: "Instrument master row is not an object." });
      return;
    }

    const segment = normalize(stringField(candidate, "segment"));
    if (segment !== "NSE_EQ" && segment !== "BSE_EQ") return;

    const instrumentType = normalize(stringField(candidate, "instrument_type"));
    if (instrumentType !== "EQ" && instrumentType !== "ETF") return;

    const providerInstrumentId = stringField(candidate, "instrument_key");
    const exchangeValue = normalize(stringField(candidate, "exchange"));
    const exchange: Exchange | undefined =
      exchangeValue === "NSE" || exchangeValue === "BSE" ? exchangeValue : undefined;
    const symbol = stringField(candidate, "trading_symbol") ?? stringField(candidate, "short_name");
    const displayName = stringField(candidate, "name") ?? stringField(candidate, "short_name");
    const isin = stringField(candidate, "isin");

    if (
      !providerInstrumentId ||
      !exchange ||
      !symbol ||
      !displayName ||
      !providerInstrumentId.startsWith(segment + "|")
    ) {
      issues.push({
        index,
        code: "INCOMPLETE_MASTER_ROW",
        message: "Cash-equity row is missing a valid provider key, exchange, symbol, or display name.",
      });
      return;
    }

    if (seenKeys.has(providerInstrumentId)) {
      issues.push({
        index,
        code: "DUPLICATE_PROVIDER_KEY",
        message: `Provider instrument key "${providerInstrumentId}" occurs more than once.`,
      });
      return;
    }
    seenKeys.add(providerInstrumentId);

    const securityType = normalize(stringField(candidate, "security_type"));
    const assetType: AssetType =
      instrumentType === "ETF" || securityType.includes("ETF") ? "etf" : "equity";

    instruments.push({
      instrumentId: exchange + ":" + providerInstrumentId,
      displayName,
      assetType,
      currency: "INR",
      symbol,
      exchange,
      ...(isin ? { isin } : {}),
      providerInstrumentId,
    });
  });

  if (instruments.length === 0) {
    issues.push({
      code: "EMPTY_INSTRUMENT_MASTER",
      message: "No supported NSE/BSE cash-equity instruments were found in the master.",
    });
  }

  return {
    instruments,
    issues,
    isComplete: issues.length === 0 && instruments.length > 0,
  };
}

/**
 * Loads the public Upstox BOD JSON master. The module cache is best-effort in
 * serverless deployments; production callers should also use framework/platform
 * caching and should never call this loader directly from a browser component.
 */
export async function loadUpstoxInstrumentMaster(
  options: InstrumentMasterLoadOptions = {},
): Promise<InstrumentMasterLoadResult> {
  const nowMs = options.nowMs ?? Date.now();
  const useCache = options.useCache !== false;
  if (useCache && cachedMaster && cachedMaster.expiresAt > nowMs) {
    return {
      status: "available",
      result: cachedMaster.result,
      retrievedAt: cachedMaster.retrievedAt,
    };
  }

  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(UPSTOX_INSTRUMENT_MASTER_URL, {
      method: "GET",
      headers: { Accept: "application/json, application/gzip" },
      cache: "force-cache",
    });
  } catch {
    return { status: "unavailable", reason: "Unable to reach the Upstox instrument-master service." };
  }

  if (!response.ok) {
    return { status: "unavailable", reason: `Upstox instrument master returned HTTP ${response.status}.` };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return { status: "unavailable", reason: "Unable to read the Upstox instrument-master response." };
  }

  const parsed = parseUpstoxInstrumentMaster(parseJsonText(bytes));
  if (parsed.instruments.length === 0) {
    return { status: "unavailable", reason: parsed.issues[0]?.message ?? "No supported instruments were loaded." };
  }

  const retrievedAt = new Date(nowMs).toISOString();
  if (useCache) {
    cachedMaster = {
      result: parsed,
      retrievedAt,
      expiresAt: nowMs + (options.cacheTtlMs ?? 6 * 60 * 60 * 1000),
    };
  }

  return { status: "available", result: parsed, retrievedAt };
}

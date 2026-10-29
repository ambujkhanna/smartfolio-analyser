import { resolveInstrument, type AssetType, type Exchange, type InstrumentReference } from "../../../domain/instrument";
import { loadUpstoxInstrumentMaster } from "../../../market-data/upstoxInstrumentMaster";
import { isValidAccessKey } from "../../../market-data/accessControl";
import { fetchUpstoxQuotes } from "../../../market-data/upstox";
import type { QuoteValidation } from "../../../domain/quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 32_000;
const MAX_QUOTES = 50;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const QUOTE_CACHE_TTL_MS = 60_000;
const MAX_QUOTE_AGE_MS = 24 * 60 * 60 * 1000;

interface RateLimitState {
  windowStartedAt: number;
  requestCount: number;
}

interface CachedQuote {
  expiresAt: number;
  providerInstrumentId: string;
  result: QuoteValidation;
}

const rateLimits = new Map<string, RateLimitState>();
const quoteCache = new Map<string, CachedQuote>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReference(value: unknown): InstrumentReference | null {
  if (!isRecord(value)) return null;

  const readString = (key: string, maxLength: number): string | undefined => {
    const item = value[key];
    if (item === undefined || item === null || item === "") return undefined;
    if (typeof item !== "string" || item.trim().length === 0 || item.length > maxLength) return undefined;
    return item.trim();
  };

  const instrumentId = readString("instrumentId", 128);
  const isin = readString("isin", 32);
  const symbol = readString("symbol", 64);
  const exchangeText = readString("exchange", 16)?.toUpperCase();
  const assetTypeText = readString("assetType", 24)?.toLowerCase();

  if (
    (value.instrumentId !== undefined && value.instrumentId !== null && value.instrumentId !== "" && !instrumentId) ||
    (value.isin !== undefined && value.isin !== null && value.isin !== "" && !isin) ||
    (value.symbol !== undefined && value.symbol !== null && value.symbol !== "" && !symbol)
  ) {
    return null;
  }

  const allowedExchanges: Exchange[] = ["NSE", "BSE", "AMFI", "UNKNOWN"];
  if (exchangeText && !allowedExchanges.includes(exchangeText as Exchange)) return null;

  const allowedAssetTypes: AssetType[] = ["equity", "etf", "mutual-fund", "other"];
  if (assetTypeText && !allowedAssetTypes.includes(assetTypeText as AssetType)) return null;
  if (!instrumentId && !isin && !symbol) return null;

  return {
    ...(instrumentId ? { instrumentId } : {}),
    ...(isin ? { isin } : {}),
    ...(symbol ? { symbol } : {}),
    ...(exchangeText ? { exchange: exchangeText as Exchange } : {}),
    ...(assetTypeText ? { assetType: assetTypeText as AssetType } : {}),
  };
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown-client";
}

function allowRequest(key: string, nowMs: number): boolean {
  if (rateLimits.size > 1000) {
    for (const [existingKey, state] of rateLimits) {
      if (nowMs - state.windowStartedAt >= RATE_WINDOW_MS) rateLimits.delete(existingKey);
    }
  }

  const state = rateLimits.get(key);
  if (!state || nowMs - state.windowStartedAt >= RATE_WINDOW_MS) {
    rateLimits.set(key, { windowStartedAt: nowMs, requestCount: 1 });
    return true;
  }
  if (state.requestCount >= MAX_REQUESTS_PER_WINDOW) return false;
  state.requestCount += 1;
  return true;
}

function quoteOutputId(reference: InstrumentReference, resolved: { instrumentId: string; isin?: string }): string {
  const requestedId = reference.instrumentId?.trim();
  if (requestedId && !requestedId.startsWith("SYMBOL:")) return requestedId;
  return reference.isin?.trim() || resolved.isin?.trim() || resolved.instrumentId;
}

/**
 * Authenticated quote endpoint. The Upstox token never leaves the server.
 * It only queries instruments resolved against the trusted public master.
 * Per-instance rate limits/cache are best-effort; deployments with broader
 * exposure should also enable hosting-level access protection.
 */
export async function POST(request: Request): Promise<Response> {
  const nowMs = Date.now();
  if (quoteCache.size > 1000) {
    for (const [instrumentId, cached] of quoteCache) {
      if (cached.expiresAt <= nowMs) quoteCache.delete(instrumentId);
    }
  }
  if (!allowRequest(clientKey(request), nowMs)) {
    return Response.json(
      { error: "Too many quote requests. Retry in a minute." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const accessKey = process.env.SMARTFOLIO_ACCESS_KEY;
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (!accessKey || accessKey.length < 32 || !token) {
    return Response.json(
      { error: "Live quotes are not configured. Set SMARTFOLIO_ACCESS_KEY (32+ random characters) and UPSTOX_ANALYTICS_TOKEN in the server environment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const suppliedKey = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!isValidAccessKey(suppliedKey, accessKey)) {
    return Response.json(
      { error: "Quote access denied. Check the Smartfolio access key." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_CHARS) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return Response.json({ error: "Unable to read request body." }, { status: 400 });
  }
  if (bodyText.length > MAX_BODY_CHARS) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText) as unknown;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isRecord(body) || !Array.isArray(body.references) || body.references.length === 0) {
    return Response.json({ error: "Provide a non-empty references array." }, { status: 400 });
  }
  if (body.references.length > MAX_QUOTES) {
    return Response.json({ error: `A maximum of ${MAX_QUOTES} instrument references is allowed per request.` }, { status: 400 });
  }

  const references = body.references.map(parseReference);
  if (references.some((reference) => reference === null)) {
    return Response.json(
      { error: "Each reference must include a valid instrument ID, ISIN, or symbol and use supported exchange/asset-type values." },
      { status: 400 },
    );
  }

  const master = await loadUpstoxInstrumentMaster();
  if (master.status === "unavailable") {
    return Response.json({ error: master.reason }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const outputByIndex = new Map<number, { instrumentId: string; result: QuoteValidation }>();
  const resolvedGroups = new Map<
    string,
    Array<{ index: number; reference: InstrumentReference; instrument: import("../../../domain/instrument").InstrumentRecord }>
  >();

  (references as InstrumentReference[]).forEach((reference, index) => {
    const resolution = resolveInstrument(reference, master.result.instruments);
    if (resolution.status !== "resolved") {
      const fallbackId = reference.instrumentId?.startsWith("SYMBOL:")
        ? reference.symbol ?? reference.instrumentId
        : reference.instrumentId ?? reference.isin ?? reference.symbol ?? "unknown";
      outputByIndex.set(index, {
        instrumentId: fallbackId,
        result: { status: "unavailable", reason: resolution.reason },
      });
      return;
    }

    const outputInstrumentId = quoteOutputId(reference, resolution.instrument);
    const group = resolvedGroups.get(outputInstrumentId) ?? [];
    group.push({ index, reference, instrument: resolution.instrument });
    resolvedGroups.set(outputInstrumentId, group);
  });

  const requests: Array<{
    outputInstrumentId: string;
    providerInstrumentId: string;
    instrument: import("../../../domain/instrument").InstrumentRecord;
    indices: number[];
  }> = [];

  for (const [outputInstrumentId, group] of resolvedGroups) {
    const providerIds = new Set(group.map((entry) => entry.instrument.providerInstrumentId));
    if (providerIds.size > 1) {
      for (const entry of group) {
        outputByIndex.set(entry.index, {
          instrumentId: outputInstrumentId,
          result: {
            status: "unavailable",
            reason: "Multiple exchange listings map to the same position. Resolve one quote venue before requesting market data.",
          },
        });
      }
      continue;
    }

    const first = group[0];
    if (!first) continue;
    const providerInstrumentId = first.instrument.providerInstrumentId;
    const cached = quoteCache.get(outputInstrumentId);
    if (
      cached &&
      cached.expiresAt > nowMs &&
      cached.providerInstrumentId === providerInstrumentId
    ) {
      for (const entry of group) {
        outputByIndex.set(entry.index, { instrumentId: outputInstrumentId, result: cached.result });
      }
      continue;
    }

    requests.push({
      outputInstrumentId,
      providerInstrumentId,
      instrument: { ...first.instrument, instrumentId: outputInstrumentId },
      indices: group.map((entry) => entry.index),
    });
  }

  if (requests.length > 0) {
    const fetched = await fetchUpstoxQuotes(
      requests.map((entry) => entry.instrument),
      { token, maxAgeMs: MAX_QUOTE_AGE_MS, nowMs },
    );
    const resultById = new Map(fetched.map((item) => [item.instrumentId, item.result]));

    for (const requestEntry of requests) {
      const result = resultById.get(requestEntry.outputInstrumentId) ?? {
        status: "unavailable" as const,
        reason: "No quote response was returned for this instrument.",
      };

      if (result.status === "available" || result.status === "stale") {
        quoteCache.set(requestEntry.outputInstrumentId, {
          expiresAt: nowMs + QUOTE_CACHE_TTL_MS,
          providerInstrumentId: requestEntry.providerInstrumentId,
          result,
        });
      }

      for (const index of requestEntry.indices) {
        outputByIndex.set(index, { instrumentId: requestEntry.outputInstrumentId, result });
      }
    }
  }

  const quotes = [...outputByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, item]) => ({ index, ...item }));

  return Response.json(
    {
      quotes,
      retrievedAt: new Date(nowMs).toISOString(),
      quoteMaxAgeMs: MAX_QUOTE_AGE_MS,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

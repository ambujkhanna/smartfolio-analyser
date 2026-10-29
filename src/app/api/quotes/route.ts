import {
  resolveInstrument,
  type AssetType,
  type Exchange,
  type InstrumentRecord,
  type InstrumentReference,
} from "../../../domain/instrument";
import { loadAmfiNavFeed } from "../../../market-data/amfiNavFeed";
import { getAmfiNavQuote } from "../../../market-data/amfiNav";
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
const MAX_EQUITY_QUOTE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_NAV_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const NAV_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface RateLimitState {
  windowStartedAt: number;
  requestCount: number;
}

interface CachedQuote {
  expiresAt: number;
  providerInstrumentId: string;
  result: QuoteValidation;
}

interface ResolvedEquityEntry {
  index: number;
  reference: InstrumentReference;
  instrument: InstrumentRecord;
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
  const amfiSchemeCode = readString("amfiSchemeCode", 32);
  const symbol = readString("symbol", 128);
  const exchangeText = readString("exchange", 16)?.toUpperCase();
  const assetTypeText = readString("assetType", 24)?.toLowerCase();

  if (
    (value.instrumentId !== undefined && value.instrumentId !== null && value.instrumentId !== "" && !instrumentId) ||
    (value.isin !== undefined && value.isin !== null && value.isin !== "" && !isin) ||
    (value.amfiSchemeCode !== undefined && value.amfiSchemeCode !== null && value.amfiSchemeCode !== "" && !amfiSchemeCode) ||
    (value.symbol !== undefined && value.symbol !== null && value.symbol !== "" && !symbol)
  ) {
    return null;
  }

  const allowedExchanges: Exchange[] = ["NSE", "BSE", "AMFI", "UNKNOWN"];
  if (exchangeText && !allowedExchanges.includes(exchangeText as Exchange)) return null;

  const allowedAssetTypes: AssetType[] = ["equity", "etf", "mutual-fund", "other"];
  if (assetTypeText && !allowedAssetTypes.includes(assetTypeText as AssetType)) return null;
  if (!instrumentId && !isin && !amfiSchemeCode && !symbol) return null;

  return {
    ...(instrumentId ? { instrumentId } : {}),
    ...(isin ? { isin } : {}),
    ...(amfiSchemeCode ? { amfiSchemeCode } : {}),
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

function quoteOutputId(reference: InstrumentReference, resolved?: InstrumentRecord): string {
  const requestedId = reference.instrumentId?.trim();
  if (requestedId && !requestedId.startsWith("SYMBOL:")) return requestedId;
  return reference.isin?.trim()
    || reference.amfiSchemeCode?.trim()
    || resolved?.isin?.trim()
    || resolved?.instrumentId
    || reference.symbol?.trim()
    || "unknown";
}

function isMutualFundReference(reference: InstrumentReference): boolean {
  return reference.assetType === "mutual-fund" || Boolean(reference.amfiSchemeCode);
}

function makeAmfiInstrument(reference: InstrumentReference, outputInstrumentId: string): InstrumentRecord {
  const schemeCode =
    reference.amfiSchemeCode?.trim()
    || (/^\d+$/.test(reference.instrumentId ?? "") ? reference.instrumentId : undefined);
  const isin =
    reference.isin?.trim()
    || (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(reference.instrumentId ?? "") ? reference.instrumentId : undefined);

  return {
    instrumentId: outputInstrumentId,
    displayName: reference.symbol ?? reference.instrumentId ?? schemeCode ?? isin ?? "Mutual fund scheme",
    assetType: "mutual-fund",
    currency: "INR",
    ...(isin ? { isin } : {}),
    ...(schemeCode ? { amfiSchemeCode: schemeCode } : {}),
    exchange: "AMFI",
  };
}

/**
 * Authenticated quote/NAV endpoint. Provider credentials never leave the server.
 * Only references resolved against public instrument masters are queried.
 * The per-instance rate limit/cache is best-effort; broader public deployments
 * should also enable hosting-level protection or shared rate limiting.
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

  const authorization = request.headers.get("authorization") ?? "";
  const authorizationMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!isValidAccessKey(authorizationMatch?.[1], accessKey)) {
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

  const parsedReferences = body.references.map(parseReference);
  if (parsedReferences.some((reference) => reference === null)) {
    return Response.json(
      { error: "Each reference must include a valid instrument ID, ISIN, scheme code, or symbol and use supported exchange/asset-type values." },
      { status: 400 },
    );
  }

  const references = parsedReferences as InstrumentReference[];
  const outputByIndex = new Map<number, { instrumentId: string; result: QuoteValidation }>();
  const mutualFundIndexes = references
    .map((reference, index) => ({ reference, index }))
    .filter(({ reference }) => isMutualFundReference(reference));

  if (mutualFundIndexes.length > 0) {
    const navFeed = await loadAmfiNavFeed();
    for (const { reference, index } of mutualFundIndexes) {
      const outputInstrumentId = quoteOutputId(reference);
      if (navFeed.status === "unavailable") {
        outputByIndex.set(index, {
          instrumentId: outputInstrumentId,
          result: { status: "unavailable", reason: navFeed.reason },
        });
        continue;
      }

      const instrument = makeAmfiInstrument(reference, outputInstrumentId);
      const navQuote = getAmfiNavQuote(instrument, navFeed.result.records, {
        nowMs,
        maxAgeMs: MAX_NAV_AGE_MS,
      });
      outputByIndex.set(index, { instrumentId: outputInstrumentId, result: navQuote });

      const schemeKey = navQuote.status === "available" || navQuote.status === "stale"
        ? navQuote.quote.providerInstrumentId
        : undefined;
      if (schemeKey && (navQuote.status === "available" || navQuote.status === "stale")) {
        quoteCache.set(outputInstrumentId, {
          expiresAt: nowMs + NAV_CACHE_TTL_MS,
          providerInstrumentId: schemeKey,
          result: navQuote,
        });
      }
    }
  }

  const equityReferences = references
    .map((reference, index) => ({ reference, index }))
    .filter(({ reference }) => !isMutualFundReference(reference));

  if (equityReferences.length > 0) {
    const master = await loadUpstoxInstrumentMaster();
    if (master.status === "unavailable") {
      for (const { reference, index } of equityReferences) {
        outputByIndex.set(index, {
          instrumentId: quoteOutputId(reference),
          result: { status: "unavailable", reason: master.reason },
        });
      }
    } else {
      const resolvedGroups = new Map<string, ResolvedEquityEntry[]>();

      for (const { reference, index } of equityReferences) {
        const resolution = resolveInstrument(reference, master.result.instruments);
        if (resolution.status !== "resolved") {
          const fallbackId = reference.instrumentId?.startsWith("SYMBOL:")
            ? reference.symbol ?? reference.instrumentId
            : reference.instrumentId ?? reference.isin ?? reference.symbol ?? "unknown";
          outputByIndex.set(index, {
            instrumentId: fallbackId,
            result: { status: "unavailable", reason: resolution.reason },
          });
          continue;
        }

        const outputInstrumentId = quoteOutputId(reference, resolution.instrument);
        const group = resolvedGroups.get(outputInstrumentId) ?? [];
        group.push({ index, reference, instrument: resolution.instrument });
        resolvedGroups.set(outputInstrumentId, group);
      }

      const requests: Array<{
        outputInstrumentId: string;
        providerInstrumentId: string;
        instrument: InstrumentRecord;
        indices: number[];
      }> = [];

      for (const [outputInstrumentId, group] of resolvedGroups) {
        const providerIds = new Set(
          group
            .map((entry) => entry.instrument.providerInstrumentId)
            .filter((value): value is string => Boolean(value)),
        );
        const missingProviderKey = group.some((entry) => !entry.instrument.providerInstrumentId);
        if (providerIds.size !== 1 || missingProviderKey) {
          const reason = providerIds.size > 1
            ? "Multiple exchange listings map to the same position. Resolve one quote venue before requesting market data."
            : "The resolved instrument has no verified provider key.";
          for (const entry of group) {
            outputByIndex.set(entry.index, {
              instrumentId: outputInstrumentId,
              result: { status: "unavailable", reason },
            });
          }
          continue;
        }

        const first = group[0];
        const providerInstrumentId = [...providerIds][0];
        if (!first || !providerInstrumentId) continue;

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
          { token, maxAgeMs: MAX_EQUITY_QUOTE_AGE_MS, nowMs },
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
    }
  }

  const quotes = [...outputByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, item]) => ({ index, ...item }));

  return Response.json(
    {
      quotes,
      retrievedAt: new Date(nowMs).toISOString(),
      quoteMaxAgeMs: { equityMs: MAX_EQUITY_QUOTE_AGE_MS, navMs: MAX_NAV_AGE_MS },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

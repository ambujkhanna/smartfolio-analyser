import { resolveInstrument, type AssetType, type Exchange, type InstrumentReference } from "../../../../domain/instrument";
import { loadUpstoxInstrumentMaster } from "../../../../market-data/upstoxInstrumentMaster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 32_000;
const MAX_REFERENCES = 100;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

interface RateLimitState {
  windowStartedAt: number;
  requestCount: number;
}

const rateLimits = new Map<string, RateLimitState>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReference(value: unknown): InstrumentReference | null {
  if (!isRecord(value)) return null;

  const readString = (key: string, maxLength: number): string | undefined => {
    const item = value[key];
    if (item === undefined || item === null || item === "") return undefined;
    if (typeof item !== "string" || item.trim().length === 0 || item.length > maxLength) {
      return undefined;
    }
    return item.trim();
  };

  const instrumentId = readString("instrumentId", 128);
  const isin = readString("isin", 32);
  const symbol = readString("symbol", 64);
  const exchangeText = readString("exchange", 16)?.toUpperCase();
  const assetTypeText = readString("assetType", 24)?.toLowerCase();

  if (
    value.instrumentId !== undefined && value.instrumentId !== null && value.instrumentId !== "" && !instrumentId ||
    value.isin !== undefined && value.isin !== null && value.isin !== "" && !isin ||
    value.symbol !== undefined && value.symbol !== null && value.symbol !== "" && !symbol
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

/**
 * Public metadata resolver only; this endpoint does not expose the quote token.
 * It bounds request size/count and uses cached public instrument-master data.
 * The in-memory rate limit is best-effort in serverless deployments.
 */
export async function POST(request: Request): Promise<Response> {
  const nowMs = Date.now();
  if (!allowRequest(clientKey(request), nowMs)) {
    return Response.json(
      { error: "Too many instrument-resolution requests. Retry in a minute." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
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
  if (body.references.length > MAX_REFERENCES) {
    return Response.json({ error: `A maximum of ${MAX_REFERENCES} references is allowed per request.` }, { status: 400 });
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
    return Response.json(
      { error: master.reason },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const results = (references as InstrumentReference[]).map((reference, index) => ({
    index,
    resolution: resolveInstrument(reference, master.result.instruments),
  }));

  return Response.json(
    {
      results,
      masterRetrievedAt: master.retrievedAt,
      masterIssueCount: master.result.issues.length,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

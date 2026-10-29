import { parseAmfiNavText, type AmfiNavParseResult } from "./amfiNav";

export const AMFI_NAV_FEED_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

export type AmfiNavFeedLoadResult =
  | {
      status: "available";
      result: AmfiNavParseResult;
      retrievedAt: string;
    }
  | {
      status: "unavailable";
      reason: string;
    };

export interface AmfiNavFeedOptions {
  fetcher?: typeof fetch;
  nowMs?: number;
  cacheTtlMs?: number;
  useCache?: boolean;
}

interface CachedFeed {
  expiresAt: number;
  result: AmfiNavParseResult;
  retrievedAt: string;
}

let cachedFeed: CachedFeed | null = null;

/**
 * Loads the public AMFI NAV text feed. The module cache is best-effort in
 * serverless deployments; Next.js fetch caching is also enabled for this
 * public, non-personal source.
 */
export async function loadAmfiNavFeed(
  options: AmfiNavFeedOptions = {},
): Promise<AmfiNavFeedLoadResult> {
  const nowMs = options.nowMs ?? Date.now();
  const useCache = options.useCache !== false;
  if (useCache && cachedFeed && cachedFeed.expiresAt > nowMs) {
    return {
      status: "available",
      result: cachedFeed.result,
      retrievedAt: cachedFeed.retrievedAt,
    };
  }

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(AMFI_NAV_FEED_URL, {
      method: "GET",
      headers: { Accept: "text/plain" },
      cache: "force-cache",
    });
  } catch {
    return { status: "unavailable", reason: "Unable to reach the AMFI NAV feed." };
  }

  if (!response.ok) {
    return { status: "unavailable", reason: `AMFI NAV feed returned HTTP ${response.status}.` };
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    return { status: "unavailable", reason: "Unable to read the AMFI NAV feed response." };
  }

  const result = parseAmfiNavText(text);
  if (result.records.length === 0) {
    return {
      status: "unavailable",
      reason: result.issues[0]?.message ?? "AMFI NAV feed contained no valid NAV records.",
    };
  }

  const retrievedAt = new Date(nowMs).toISOString();
  if (useCache) {
    cachedFeed = {
      result,
      retrievedAt,
      expiresAt: nowMs + (options.cacheTtlMs ?? 6 * 60 * 60 * 1000),
    };
  }

  return { status: "available", result, retrievedAt };
}

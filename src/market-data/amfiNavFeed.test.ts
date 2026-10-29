import { describe, expect, it, vi } from "vitest";
import { AMFI_NAV_FEED_URL, loadAmfiNavFeed } from "./amfiNavFeed";

const feedText = [
  "120;INF123A01011;INF123A01029;Example Direct Growth;Direct;Growth;123.4567;28-Oct-2026",
  "121;INF123A01037;;Example Regular Growth;Regular;Growth;98.7654;28-Oct-2026",
].join("\n");

describe("loadAmfiNavFeed", () => {
  it("loads and parses AMFI text without credentials", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(AMFI_NAV_FEED_URL);
      return new Response(feedText, { status: 200 });
    });
    const result = await loadAmfiNavFeed({
      fetcher,
      nowMs: Date.parse("2026-10-29T10:00:00.000Z"),
      useCache: false,
    });
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.result.records).toHaveLength(2);
      expect(result.result.records[0].nav).toBe(123.4567);
      expect(result.retrievedAt).toBe("2026-10-29T10:00:00.000Z");
    }
  });

  it("returns unavailable when the feed request fails", async () => {
    const fetcher = vi.fn(async () => { throw new Error("network"); });
    const result = await loadAmfiNavFeed({ fetcher, useCache: false });
    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable when the feed contains no valid NAV rows", async () => {
    const fetcher = vi.fn(async () => new Response("not a NAV feed", { status: 200 }));
    const result = await loadAmfiNavFeed({ fetcher, useCache: false });
    expect(result.status).toBe("unavailable");
  });
});

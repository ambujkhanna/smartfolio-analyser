import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { AMFI_NAV_FEED_URL } from "../../../market-data/amfiNavFeed";

const accessKey = "k".repeat(64);

function request(body: string, authorization?: string, clientIp = "192.0.2.10"): Request {
  return new Request("http://localhost/api/quotes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": clientIp,
      ...(authorization ? { authorization } : {}),
    },
    body,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/quotes access controls", () => {
  it("keeps live quotes disabled when server secrets are missing", async () => {
    vi.stubEnv("SMARTFOLIO_ACCESS_KEY", "");
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "");
    const response = await POST(request(JSON.stringify({ references: [] }), `Bearer ${accessKey}`));
    expect(response.status).toBe(503);
  });

  it("rejects a wrong access key before loading market data", async () => {
    vi.stubEnv("SMARTFOLIO_ACCESS_KEY", accessKey);
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "provider-token-not-used-in-test");
    const response = await POST(request(JSON.stringify({ references: [] }), "Bearer " + "x".repeat(64), "192.0.2.11"));
    expect(response.status).toBe(401);
  });

  it("serves a fresh AMFI NAV without an Upstox token", async () => {
    vi.stubEnv("SMARTFOLIO_ACCESS_KEY", accessKey);
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "");
    const navText = "120;INF123A01011;INF123A01029;Example Direct Growth;Direct;Growth;123.4567;28-Oct-2026";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(AMFI_NAV_FEED_URL);
      return new Response(navText, { status: 200 });
    }));

    const response = await POST(request(
      JSON.stringify({
        references: [{ instrumentId: "120", amfiSchemeCode: "120", assetType: "mutual-fund" }],
      }),
      `Bearer ${accessKey}`,
      "192.0.2.13",
    ));
    expect(response.status).toBe(200);
    const payload = await response.json() as { quotes: Array<{ result: { status: string; quote?: { price: number; quoteType: string } } }> };
    expect(payload.quotes[0].result.status).toBe("available");
    expect(payload.quotes[0].result.quote?.price).toBe(123.4567);
    expect(payload.quotes[0].result.quote?.quoteType).toBe("nav");
  });

  it("rejects malformed request bodies before loading the instrument master", async () => {
    vi.stubEnv("SMARTFOLIO_ACCESS_KEY", accessKey);
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "provider-token-not-used-in-test");
    const response = await POST(request("not-json", `Bearer ${accessKey}`, "192.0.2.12"));
    expect(response.status).toBe(400);
  });
});

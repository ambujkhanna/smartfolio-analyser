import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { accessToken } from "../../../lib/siteAccess";
import { AMFI_NAV_FEED_URL } from "../../../market-data/amfiNavFeed";
import { UPSTOX_INSTRUMENT_MASTER_URL } from "../../../market-data/upstoxInstrumentMaster";

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
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    // The fixture NAV is dated 28-Oct-2026; pin "now" to the next day so the
    // freshness check does not start failing as real time passes.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T10:00:00+05:30"));
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

  it("returns a validated equity quote using the server-side Upstox token", async () => {
    vi.stubEnv("SMARTFOLIO_ACCESS_KEY", accessKey);
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "server-only-test-token");
    const observedAt = new Date(Date.now() - 60_000).toISOString();
    const masterRows = [{
      segment: "NSE_EQ",
      name: "Example Industries",
      exchange: "NSE",
      isin: "INE002A01018",
      instrument_type: "EQ",
      instrument_key: "NSE_EQ|INE002A01018",
      trading_symbol: "EXAMPLE",
      security_type: "NORMAL",
    }];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === UPSTOX_INSTRUMENT_MASTER_URL) {
        return new Response(JSON.stringify(masterRows), { status: 200 });
      }
      if (url.startsWith("https://api.upstox.com/v3/market-quote/quotes")) {
        return new Response(JSON.stringify({
          status: "success",
          data: {
            "NSE_EQ|INE002A01018": {
              instrument_token: "NSE_EQ|INE002A01018",
              last_price: 123.45,
              last_trade_time: observedAt,
              timestamp: observedAt,
            },
          },
        }), { status: 200 });
      }
      throw new Error("Unexpected fetch URL: " + url);
    }));

    const response = await POST(request(
      JSON.stringify({
        references: [{ instrumentId: "INE002A01018", isin: "INE002A01018", exchange: "NSE", assetType: "equity" }],
      }),
      `Bearer ${accessKey}`,
      "192.0.2.14",
    ));
    expect(response.status).toBe(200);
    const payload = await response.json() as { quotes: Array<{ result: { status: string; quote?: { price: number; source: string } } }> };
    expect(payload.quotes[0].result.status).toBe("available");
    expect(payload.quotes[0].result.quote?.price).toBe(123.45);
    expect(payload.quotes[0].result.quote?.source).toBe("Upstox Market Quote V3");
  });

  it("rejects malformed request bodies before loading the instrument master", async () => {
    vi.stubEnv("SMARTFOLIO_ACCESS_KEY", accessKey);
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "provider-token-not-used-in-test");
    const response = await POST(request("not-json", `Bearer ${accessKey}`, "192.0.2.12"));
    expect(response.status).toBe(400);
  });

  it("lets a browser that passed the access gate through without a separate key", async () => {
    vi.stubEnv("APP_ACCESS_CODE", "my private passphrase");
    vi.stubEnv("SMARTFOLIO_ACCESS_KEY", "");
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "provider-token-not-used-in-test");
    const signedIn = request("not-json", undefined, "192.0.2.13");
    signedIn.headers.set("cookie", "smartfolio_access=" + (await accessToken("my private passphrase")));
    expect((await POST(signedIn)).status).toBe(400);

    const wrongCookie = request("not-json", undefined, "192.0.2.14");
    wrongCookie.headers.set("cookie", "smartfolio_access=" + (await accessToken("another code")));
    expect((await POST(wrongCookie)).status).toBe(503);
  });
});

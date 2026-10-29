import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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

  it("rejects malformed request bodies before loading the instrument master", async () => {
    vi.stubEnv("SMARTFOLIO_ACCESS_KEY", accessKey);
    vi.stubEnv("UPSTOX_ANALYTICS_TOKEN", "provider-token-not-used-in-test");
    const response = await POST(request("not-json", `Bearer ${accessKey}`, "192.0.2.12"));
    expect(response.status).toBe(400);
  });
});

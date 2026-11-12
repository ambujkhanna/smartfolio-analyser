import { afterEach, describe, expect, it, vi } from "vitest";

const setCookie = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ set: setCookie }) }));

const { GET } = await import("./route");

const REGISTERED = "https://registered.example.app/api/zerodha/callback";

describe("GET /api/zerodha/login", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setCookie.mockReset();
  });

  it("returns 503 when Zerodha keys are missing", async () => {
    vi.stubEnv("KITE_API_KEY", "");
    const response = await GET(new Request("https://registered.example.app/api/zerodha/login"));
    expect(response.status).toBe(503);
  });

  it("sends a login started on another site to the registered site first", async () => {
    vi.stubEnv("KITE_API_KEY", "key");
    vi.stubEnv("KITE_REDIRECT_URL", REGISTERED);
    const response = await GET(new Request("https://other-preview.example.app/api/zerodha/login"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://registered.example.app/api/zerodha/login");
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("starts the Kite login on the registered site", async () => {
    vi.stubEnv("KITE_API_KEY", "key");
    vi.stubEnv("KITE_REDIRECT_URL", REGISTERED);
    const response = await GET(new Request("https://registered.example.app/api/zerodha/login"));
    expect(response.headers.get("location")).toMatch(/^https:\/\/kite\.zerodha\.com\/connect\/login\?/);
    expect(setCookie).toHaveBeenCalledOnce();
  });
});

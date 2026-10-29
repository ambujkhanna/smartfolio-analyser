import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { saveZerodhaSession } from "../../../../lib/zerodhaSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const returnedState = url.searchParams.get("state");
  const jar = await cookies();
  const expectedState = jar.get("smartfolio_kite_oauth_state")?.value;
  jar.set("smartfolio_kite_oauth_state", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/zerodha/callback", maxAge: 0 });
  const requestToken = url.searchParams.get("request_token");
  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;

  if (status !== "success" || !requestToken || !apiKey || !apiSecret || !returnedState || !expectedState || !safeEqual(returnedState, expectedState)) {
    return NextResponse.redirect(new URL("/?zerodha=connection-failed", url.origin));
  }

  const checksum = createHash("sha256").update(apiKey + requestToken + apiSecret).digest("hex");
  try {
    const response = await fetch("https://api.kite.trade/session/token", {
      method: "POST",
      headers: { "X-Kite-Version": "3", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }).toString(),
      cache: "no-store",
    });
    const payload: unknown = await response.json();
    if (!response.ok || typeof payload !== "object" || payload === null || !("data" in payload)) {
      return NextResponse.redirect(new URL("/?zerodha=connection-failed", url.origin));
    }
    const data = (payload as { data?: { access_token?: unknown; api_key?: unknown } }).data;
    if (typeof data?.access_token !== "string" || data.api_key !== apiKey) {
      return NextResponse.redirect(new URL("/?zerodha=connection-failed", url.origin));
    }
    await saveZerodhaSession(data.access_token);
    return NextResponse.redirect(new URL("/?zerodha=connected", url.origin));
  } catch {
    return NextResponse.redirect(new URL("/?zerodha=connection-failed", url.origin));
  }
}

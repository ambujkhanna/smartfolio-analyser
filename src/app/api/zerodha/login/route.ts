import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Zerodha is not configured yet. Add KITE_API_KEY and KITE_API_SECRET to server environment variables." }, { status: 503 });
  }

  const configuredRedirect = process.env.KITE_REDIRECT_URL;
  const requestUrl = new URL(request.url);
  const callbackUrl = new URL("/api/zerodha/callback", configuredRedirect || requestUrl.origin).toString();
  if (configuredRedirect && new URL(configuredRedirect).pathname !== "/api/zerodha/callback") {
    return NextResponse.json({ error: "KITE_REDIRECT_URL must point to /api/zerodha/callback." }, { status: 500 });
  }

  // Zerodha always returns to the registered redirect URL. If this request came to a different
  // site (for example another branch preview), start the login on the registered site instead,
  // otherwise the state cookie is set on the wrong site and the callback rejects the login.
  if (configuredRedirect) {
    const registeredOrigin = new URL(configuredRedirect).origin;
    if (registeredOrigin !== requestUrl.origin) {
      return NextResponse.redirect(new URL("/api/zerodha/login", registeredOrigin));
    }
  }

  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set("smartfolio_kite_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/zerodha/callback",
    maxAge: 600,
  });

  const loginUrl = new URL("https://kite.zerodha.com/connect/login");
  loginUrl.searchParams.set("v", "3");
  loginUrl.searchParams.set("api_key", apiKey);
  loginUrl.searchParams.set("redirect_params", new URLSearchParams({ state }).toString());
  // Keep callbackUrl constructed here to validate the configured redirect before sending the user to Zerodha.
  void callbackUrl;
  return NextResponse.redirect(loginUrl);
}

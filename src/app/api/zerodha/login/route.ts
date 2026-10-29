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

  const loginUrl = new URL("https://kite.zerodha.com/connect/login");
  loginUrl.searchParams.set("v", "3");
  loginUrl.searchParams.set("api_key", apiKey);
  return NextResponse.redirect(loginUrl);
}

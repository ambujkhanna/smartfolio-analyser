import { NextResponse } from "next/server";
import { getZerodhaAccessToken } from "../../../../lib/zerodhaSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const endpoints = {
  holdings: "/portfolio/holdings",
  positions: "/portfolio/positions",
  orders: "/orders",
  trades: "/trades",
} as const;

type DataType = keyof typeof endpoints;

export async function GET(request: Request) {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "KITE_API_KEY is not configured." }, { status: 503 });
  const accessToken = await getZerodhaAccessToken();
  if (!accessToken) return NextResponse.json({ error: "Zerodha is not connected. Connect and authorize your account first." }, { status: 401 });

  const type = new URL(request.url).searchParams.get("type") as DataType | null;
  if (!type || !(type in endpoints)) {
    return NextResponse.json({ error: "Unsupported data type. Use holdings, positions, orders, or trades." }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.kite.trade" + endpoints[type], {
      headers: { "X-Kite-Version": "3", Authorization: `token ${apiKey}:${accessToken}` },
      cache: "no-store",
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
        ? payload.message : "Kite Connect request failed.";
      return NextResponse.json({ error: message, reauthorize: response.status === 403 }, { status: response.status });
    }
    return NextResponse.json({ source: "zerodha-kite-connect", type, retrievedAt: new Date().toISOString(), data: payload });
  } catch {
    return NextResponse.json({ error: "Unable to reach Kite Connect. Please retry." }, { status: 502 });
  }
}

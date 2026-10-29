import { NextResponse } from "next/server";
import { clearZerodhaSession } from "../../../../lib/zerodhaSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  await clearZerodhaSession();
  return NextResponse.json({ connected: false });
}

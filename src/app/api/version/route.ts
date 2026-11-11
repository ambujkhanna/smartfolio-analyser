import { NextResponse } from "next/server";
import { getBuildInfo } from "../../../lib/buildInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns the commit this deployment was built from (no secrets). */
export async function GET() {
  return NextResponse.json(getBuildInfo(), {
    headers: { "cache-control": "no-store" },
  });
}

import { NextResponse } from "next/server";
import { ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, accessToken, normalizeCode, safeEqual, safeNextPath } from "../../../lib/siteAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const code = process.env.APP_ACCESS_CODE;
  const form = await request.formData().catch(() => null);
  const next = safeNextPath(form?.get("next"));
  if (!code) return NextResponse.redirect(new URL(next, request.url), 303);

  const entered = String(form?.get("code") ?? "");
  const expected = await accessToken(code);
  const given = await accessToken(entered);
  if (!normalizeCode(entered) || !safeEqual(given, expected)) {
    // Slow down guessing a little; choose a long passphrase for real protection.
    await new Promise((resolve) => setTimeout(resolve, 800));
    const retry = new URL("/access", request.url);
    retry.searchParams.set("error", "1");
    retry.searchParams.set("next", next);
    return NextResponse.redirect(retry, 303);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(ACCESS_COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  return response;
}

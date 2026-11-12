import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, hasSiteAccess } from "./lib/siteAccess";

const OPEN_PATHS = ["/access", "/api/access"];

export async function middleware(request: NextRequest) {
  const code = process.env.APP_ACCESS_CODE;
  if (!code) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (OPEN_PATHS.includes(pathname)) return NextResponse.next();
  if (await hasSiteAccess(request.cookies.get(ACCESS_COOKIE)?.value, code)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Enter the Smartfolio access code first." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/access";
  url.search = "";
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};

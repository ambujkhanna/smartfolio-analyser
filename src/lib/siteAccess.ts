/**
 * Free, owner-only access gate for a public deployment (e.g. the Vercel
 * Production URL on the Hobby plan, which Vercel Authentication does not cover).
 *
 * When APP_ACCESS_CODE is set, every page and API needs a cookie proving the
 * visitor entered that code once. The cookie holds an HMAC of the code, never
 * the code itself, and lasts a year. Changing APP_ACCESS_CODE signs everyone out.
 * When APP_ACCESS_CODE is unset (local development, protected previews) the gate is off.
 */
export const ACCESS_COOKIE = "smartfolio_access";
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const encoder = new TextEncoder();

export async function accessToken(code: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(code), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode("smartfolio-site-access-v1"));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function hasSiteAccess(cookieValue: string | undefined, code: string): Promise<boolean> {
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await accessToken(code));
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Only same-site relative paths are allowed as a post-login destination. */
export function safeNextPath(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

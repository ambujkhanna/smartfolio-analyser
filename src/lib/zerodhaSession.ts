import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "smartfolio_zerodha_session";
const COOKIE_MAX_AGE = 60 * 60 * 12;

function encryptionKey(): Buffer {
  const raw = process.env.KITE_SESSION_ENCRYPTION_KEY;
  if (!raw) throw new Error("KITE_SESSION_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("KITE_SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptSession(accessToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptSession(value: string): string | null {
  try {
    const [ivText, tagText, encryptedText] = value.split(".");
    if (!ivText || !tagText || !encryptedText) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export async function saveZerodhaSession(accessToken: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, encryptSession(accessToken), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function getZerodhaAccessToken(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  return value ? decryptSession(value) : null;
}

export async function clearZerodhaSession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

import { timingSafeEqual } from "node:crypto";

/**
 * Compare a request key with the configured server key without exposing the
 * configured secret. The server key must be long and randomly generated.
 */
export function isValidAccessKey(supplied: string | undefined, expected: string | undefined): boolean {
  if (!supplied || !expected || expected.length < 32 || supplied.length !== expected.length) {
    return false;
  }

  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (suppliedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(suppliedBytes, expectedBytes);
}

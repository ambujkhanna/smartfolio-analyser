/**
 * Formats a known finite monetary value as INR.
 * Missing or invalid values remain explicitly unavailable; they are never
 * silently converted to zero.
 */
export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

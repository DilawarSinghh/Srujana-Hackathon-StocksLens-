/**
 * Display formatters. Always show units. Missing values render "Not available".
 */

const NA = "Not available";

/** INR crore with the ₹ Cr unit. */
export function formatCrore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  const abs = Math.abs(value);
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(2)} L Cr`;
  if (abs >= 1e3) return `₹${(value / 1e3).toFixed(2)} K Cr`;
  return `₹${value.toFixed(0)} Cr`;
}

/** A plain rupee price (not crore). */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Rupee amount with a sign, for P&L (e.g. +₹1,234.00 / -₹500.00). */
export function formatSignedRupee(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  const sign = value >= 0 ? "+" : "-";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A ratio stored as a fraction (e.g. 0.182) shown as a percent. */
export function formatPercentFromFraction(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${(value * 100).toFixed(digits)}%`;
}

/** A value already in percent units. */
export function formatPercent(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${value.toFixed(digits)}%`;
}

/** A multiple like P/E or D/E. */
export function formatMultiple(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${value.toFixed(digits)}x`;
}

/** Day change percent from price vs prev_close. */
export function dayChangePercent(
  price: number | null | undefined,
  prevClose: number | null | undefined,
): number | null {
  if (
    price == null ||
    prevClose == null ||
    !Number.isFinite(price) ||
    !Number.isFinite(prevClose) ||
    prevClose === 0
  ) {
    return null;
  }
  return ((price - prevClose) / prevClose) * 100;
}

export { NA as NOT_AVAILABLE };

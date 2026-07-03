/**
 * currency.ts — Verdant Finance: Currency formatting utilities
 *
 * All monetary values travel through the system as integers (paise).
 * These helpers handle the paise ↔ rupee conversion only at render time.
 */

const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a paise integer as a formatted INR string.
 * @example formatCurrency(12500000) → "₹1,25,000.00"
 */
export function formatCurrency(paise: number): string {
  return INR_FORMATTER.format(paise / 100);
}

/**
 * Formats paise as a compact string for display (e.g. large balance figures).
 * @example formatCurrencyCompact(12500000) → "₹1,25,000"
 */
export function formatCurrencyCompact(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/**
 * Converts a rupee string (from form input) to paise integer.
 * Returns null if the value is invalid.
 * @example rupeesToPaise("1250.50") → 125050
 */
export function rupeesToPaise(rupees: string): number | null {
  const parsed = parseFloat(rupees);
  if (isNaN(parsed) || parsed <= 0) return null;
  // Round to avoid floating-point artifacts before converting to integer
  return Math.round(parsed * 100);
}

/**
 * Converts paise to rupees as a decimal number (for input field defaults).
 * @example paiseToRupees(125050) → 1250.50
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

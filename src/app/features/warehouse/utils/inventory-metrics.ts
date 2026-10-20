/**
 * Display-only ratios derived from server aggregates.
 *
 * Quantities and values (sold / available / costs / profit) are always
 * rendered exactly as the API returns them — nothing here recomputes them.
 * These helpers only express existing figures relative to each other.
 */

interface SalesFigures {
  soldCost: number;
  totalProfit: number;
}

interface QuantityFigures {
  purchasedQuantity: number;
  soldQuantity: number;
}

/** Sales revenue of the sold units: their cost plus the profit made on them. */
export function salesValue(f: SalesFigures): number {
  return (f.soldCost ?? 0) + (f.totalProfit ?? 0);
}

/** Share of purchased units that have been sold, 0 → 100. */
export function sellThroughPercent(f: QuantityFigures): number {
  return percentOf(f.soldQuantity, f.purchasedQuantity);
}

/** Profit as a share of sales revenue, 0 → 100 (may be negative). */
export function profitMarginPercent(f: SalesFigures): number {
  return percentOf(f.totalProfit, salesValue(f));
}

function percentOf(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round(((part ?? 0) / whole) * 100);
}

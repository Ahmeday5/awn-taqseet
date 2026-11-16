import { formatPrintDate } from '../../core/utils/print-format.util';

/** A date range as sent to the API (`YYYY-MM-DD`, either end optional). */
export interface DateRange {
  readonly fromDate?: string | null;
  readonly toDate?: string | null;
}

export const EMPTY_DATE_RANGE: DateRange = Object.freeze({});

export function hasDateRange(range: DateRange | null | undefined): boolean {
  return !!range?.fromDate || !!range?.toDate;
}

/**
 * Human period suffix for a card title, e.g. `من 1/11/2026 إلى 16/11/2026`.
 * Open-ended ranges read `من …` / `حتى …`; no range returns `''`.
 */
export function periodLabel(range: DateRange | null | undefined): string {
  const from = range?.fromDate ? formatPrintDate(range.fromDate) : '';
  const to = range?.toDate ? formatPrintDate(range.toDate) : '';
  if (from && to) return `من ${from} إلى ${to}`;
  if (from) return `من ${from}`;
  if (to) return `حتى ${to}`;
  return '';
}

/** `base` alone, or `base` followed by the period when a range is applied. */
export function withPeriod(base: string, range: DateRange | null | undefined): string {
  const period = periodLabel(range);
  return period ? `${base} ${period}` : base;
}

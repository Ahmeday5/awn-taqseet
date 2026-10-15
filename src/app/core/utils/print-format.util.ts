import { environment } from '../../../environments/environment';

/**
 * Cell formatting shared by every printable/exportable document (browser
 * print reports and generated PDFs) so the same value always reads the same
 * way on paper, whatever produced it.
 */

/** Describes one column in a printable table. */
export interface PrintColumn<T> {
  /** Picks a property off the row, or computes the value from the row. */
  readonly key: keyof T | ((row: T) => unknown);
  readonly header: string;
  readonly align?: 'start' | 'center' | 'end';
  /** CSS width hint (e.g. `'120px'`, `'12%'`). Otherwise auto. */
  readonly width?: string;
  /**
   * Either a named formatter (consistent with the app's pipes) or a custom
   * function. Custom functions receive the resolved value and the row.
   */
  readonly format?:
    | 'currency'
    | 'date'
    | 'shortDate'
    | 'percent'
    | 'number'
    | ((value: unknown, row: T) => string);
  /** Visual emphasis — use sparingly (totals, identifiers). */
  readonly bold?: boolean;
}

/** Optional totals row appended below the table body. */
export interface PrintTotals {
  /** Label cell text (defaults to "الإجمالي"). */
  readonly label?: string;
  /** Spans applied to the label cell (defaults to 1). */
  readonly labelColSpan?: number;
  /**
   * Cells after the label. Each entry's index maps 1-to-1 against the columns
   * starting at `labelColSpan`. Use `null` for an empty cell.
   */
  readonly cells: ReadonlyArray<string | null>;
}

const EMPTY = '—';

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

/** Resolved + formatted text for one cell. */
export function formatPrintCell<T>(col: PrintColumn<T>, row: T): string {
  const raw = typeof col.key === 'function'
    ? col.key(row)
    : (row as Record<string, unknown>)[col.key as string];

  if (typeof col.format === 'function') return col.format(raw, row);
  if (raw === null || raw === undefined || raw === '') return EMPTY;

  switch (col.format) {
    case 'currency':  return formatPrintCurrency(raw);
    case 'date':      return formatPrintDate(raw, 'long');
    case 'shortDate': return formatPrintDate(raw, 'short');
    case 'percent':   return formatPrintPercent(raw);
    case 'number':    return formatPrintNumber(raw);
    default:          return String(raw);
  }
}

/** `15000.4` → `١٥٬٠٠٠ ج.م` (rounded, like the on-screen currency pipe). */
export function formatPrintCurrency(raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return EMPTY;
  return `${Math.round(n).toLocaleString('ar-EG')} ${environment.currency}`;
}

export function formatPrintNumber(raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return EMPTY;
  return n.toLocaleString('ar-EG');
}

export function formatPrintPercent(raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return EMPTY;
  return `${n}%`;
}

/** `short` → `5/3/2026` · `long` → `5 مارس 2026`. */
export function formatPrintDate(raw: unknown, kind: 'short' | 'long' = 'short'): string {
  if (raw === null || raw === undefined || raw === '') return EMPTY;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(date.getTime())) return EMPTY;
  const d = date.getDate();
  const y = date.getFullYear();
  return kind === 'short'
    ? `${d}/${date.getMonth() + 1}/${y}`
    : `${d} ${MONTHS[date.getMonth()]} ${y}`;
}

/** `5/3/2026 — 14:05` */
export function formatPrintDateTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatPrintDate(date, 'short')} — ${hh}:${mm}`;
}

/**
 * Minimal HTML escaper for values interpolated into generated markup.
 * Covers the five characters that change parser state.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

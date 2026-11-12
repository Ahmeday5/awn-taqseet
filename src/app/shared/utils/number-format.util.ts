import { environment } from '../../../environments/environment';

/**
 * Locale-aware number formatting for accounting views.
 *
 * Unlike `CurrencyArPipe` (rounded, hides zero by default — fine for KPI
 * tiles), these keep two decimals and the sign intact: on a reconciliation
 * screen a ٠٫٠١ difference or a negative balance IS the information.
 *
 * Formatters are created once — `Intl.NumberFormat` construction is costly
 * and these run for every table cell.
 */
const LOCALE = 'ar-EG';

const MONEY_FORMAT = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INTEGER_FORMAT = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

const PERCENT_FORMAT = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 1,
});

const TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
});

const EMPTY = '—';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Two-decimal figure with the sign kept. Values that round to zero are
 * printed unsigned so `-0.001` never shows as "−٠٫٠٠". Intl prefixes
 * negatives with an Arabic Letter Mark, so the minus stays on the
 * reading-start side inside RTL text.
 */
function formatSigned2dp(value: number): string {
  return MONEY_FORMAT.format(Math.abs(value) < 0.005 ? 0 : value);
}

/** `1234.5` → `١٬٢٣٤٫٥٠ ج.م` · negatives keep their sign. */
export function formatMoneyAr(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EMPTY;
  return `${formatSigned2dp(value)} ${environment.currency}`;
}

/**
 * Same as `formatMoneyAr` without the currency suffix — for dense report
 * grids where every cell is money. `-1234.5` → `؜-١٬٢٣٤٫٥٠`.
 * Never clamps: a negative profit IS the information.
 */
export function formatAmountAr(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EMPTY;
  return formatSigned2dp(value);
}

/** `1234` → `١٬٢٣٤` */
export function formatNumberAr(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EMPTY;
  return INTEGER_FORMAT.format(value);
}

/** `12.345` (already a percentage) → `١٢٫٣٪` */
export function formatPercentAr(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EMPTY;
  return `${PERCENT_FORMAT.format(value)}٪`;
}

/** `Date` → `٠٤:٤٨ م` */
export function formatTimeAr(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return EMPTY;
  return TIME_FORMAT.format(value);
}

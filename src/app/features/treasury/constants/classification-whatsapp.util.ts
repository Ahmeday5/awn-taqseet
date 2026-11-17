import { formatMoneyAr } from '../../../shared/utils/number-format.util';
import { DateRange, periodLabel, withPeriod } from '../../../shared/utils/period-label.util';
import {
  CapitalClassificationStatement,
  CapitalClassificationStatementEntry,
} from '../models/capital-classification.model';

const SEPARATOR = '────────────';

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ar-EG');
}

function signedMoney(value: number): string {
  return `${value < 0 ? '−' : '+'}${formatMoneyAr(Math.abs(value))}`;
}

/**
 * Full classification statement as WhatsApp text: header, every movement
 * numbered in statement order (same serials as the on-screen table), then the
 * period totals. A classification has no owner or phone, so it is shared as
 * text and the user picks the recipient.
 */
export function buildClassificationWhatsappMessage(
  st: CapitalClassificationStatement,
  entries: readonly CapitalClassificationStatementEntry[],
  range: DateRange,
): string {
  const lines = [
    `*كشف حساب تصنيف — ${st.classification?.name ?? ''}*`,
    `الفترة: ${periodLabel(range) || 'كل الحركات'}`,
    SEPARATOR,
  ];

  if (entries.length === 0) {
    lines.push('لا توجد حركات.');
  }
  entries.forEach((e, i) => {
    lines.push(
      `*${i + 1})* ${shortDate(e.date)} — ${e.transactionTypeAr || e.transactionType} — ${e.shareholderName || '—'}`,
      `المبلغ: ${signedMoney(e.signedAmount ?? 0)} | الرصيد: ${formatMoneyAr(e.runningBalance)}`,
    );
    if (e.treasuryName) lines.push(`الخزينة: ${e.treasuryName}`);
    if (e.notes) lines.push(`ملاحظات: ${e.notes}`);
    lines.push('');
  });

  lines.push(
    SEPARATOR,
    `عدد الحركات: ${entries.length.toLocaleString('ar-EG')}`,
    `إجمالي الإيداعات: ${formatMoneyAr(st.totalDeposits)}`,
    `إجمالي السحوبات: ${formatMoneyAr(st.totalWithdrawals)}`,
    `*${withPeriod('صافي الرصيد', range)}: ${formatMoneyAr(st.netBalance)}*`,
  );
  return lines.join('\n');
}

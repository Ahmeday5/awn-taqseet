import { PdfTone } from '../../../core/pdf/pdf.models';

/** Arabic labels for contract enums as the backend sends them. */

export const PAYMENT_FREQUENCY_LABELS: Readonly<Record<string, string>> = {
  Weekly: 'أسبوعي',
  Monthly: 'شهري',
  Quarterly: 'ربع سنوي',
  SemiAnnual: 'نصف سنوي',
  SemiAnnually: 'نصف سنوي',
  Annual: 'سنوي',
  Annually: 'سنوي',
};

/** Months between two installments, per payment frequency. */
export const PAYMENT_FREQUENCY_MONTHS: Readonly<Record<string, number>> = {
  Monthly: 1,
  Quarterly: 3,
  SemiAnnual: 6,
  SemiAnnually: 6,
  Annual: 12,
  Annually: 12,
};

export const CONTRACT_STATUS_LABELS: Readonly<Record<string, string>> = {
  Active: 'ساري',
  Completed: 'مكتمل',
  Defaulted: 'متعثر',
  Cancelled: 'ملغي',
  Returned: 'مرتجع',
};

export const INSTALLMENT_STATUS_VIEW: Readonly<Record<string, { label: string; tone: PdfTone }>> = {
  Paid: { label: 'مدفوع', tone: 'positive' },
  Partial: { label: 'مدفوع جزئياً', tone: 'warning' },
  PartiallyPaid: { label: 'مدفوع جزئياً', tone: 'warning' },
  Upcoming: { label: 'مستحق', tone: 'default' },
  Pending: { label: 'مستحق', tone: 'default' },
  Overdue: { label: 'متأخر', tone: 'negative' },
};

export function paymentFrequencyLabel(freq: string | null | undefined): string {
  return freq ? (PAYMENT_FREQUENCY_LABELS[freq] ?? freq) : '—';
}

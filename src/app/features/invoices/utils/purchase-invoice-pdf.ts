import { PdfReport, PdfTone } from '../../../core/pdf/pdf.models';
import { formatPrintCurrency as money, formatPrintDate as date } from '../../../core/utils/print-format.util';
import {
  PURCHASE_INVOICE_STATUS_VIEW,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  PurchaseInvoiceStatusView,
} from '../models/invoice.model';

const STATUS_TONE: Record<PurchaseInvoiceStatusView['variant'], PdfTone> = {
  ok: 'positive',
  warn: 'warning',
  bad: 'negative',
  info: 'accent',
};

/** A supplier purchase invoice as a sendable document. */
export function buildPurchaseInvoiceReport(inv: PurchaseInvoice): PdfReport<PurchaseInvoiceItem> {
  const status = PURCHASE_INVOICE_STATUS_VIEW[inv.status];

  return {
    title: 'فاتورة مشتريات',
    subtitle: inv.supplierName,
    reference: `رقم ${inv.invoiceNumber}`,
    status: status ? { label: status.label, tone: STATUS_TONE[status.variant] } : undefined,
    fields: [
      { label: 'المورد', value: inv.supplierName },
      { label: 'المخزن', value: inv.isDirect ? 'فاتورة مباشرة' : inv.warehouseName },
      { label: 'تاريخ الفاتورة', value: date(inv.invoiceDate, 'long') },
      { label: 'تاريخ الاستحقاق', value: date(inv.dueDate, 'long') },
    ],
    table: {
      caption: `الأصناف (${inv.items.length.toLocaleString('ar-EG')})`,
      emptyMessage: 'لا توجد أصناف على هذه الفاتورة',
      rows: inv.items,
      columns: [
        { key: (row) => inv.items.indexOf(row) + 1, header: '#', align: 'center', width: '6%' },
        { key: (row) => row.productName || '—', header: 'الصنف', align: 'start', bold: true, width: '30%' },
        { key: 'quantity', header: 'الكمية', align: 'center', format: 'number', width: '9%' },
        { key: 'unitPrice', header: 'سعر الوحدة', align: 'end', format: 'currency', width: '14%' },
        {
          key: 'discountAmount',
          header: 'الخصم',
          align: 'end',
          width: '12%',
          format: (v) => (Number(v) > 0 ? `− ${money(v)}` : '—'),
        },
        { key: (row) => row.lineTotal ?? 0, header: 'الإجمالي', align: 'end', format: 'currency', bold: true, width: '15%' },
        { key: (row) => row.notes || '—', header: 'ملاحظات', align: 'start' },
      ],
    },
    totals: [
      { label: 'إجمالي الأصناف قبل الخصم', value: money(inv.subtotal) },
      ...(inv.discountAmount > 0 ? [{ label: 'الخصم', value: `− ${money(inv.discountAmount)}`, tone: 'negative' as const }] : []),
      ...(inv.taxAmount > 0 ? [{ label: 'ضريبة القيمة المضافة', value: money(inv.taxAmount) }] : []),
      { label: 'الإجمالي المستحق', value: money(inv.totalAmount), emphasis: true },
      { label: 'المدفوع', value: money(inv.paidAmount), tone: 'positive' },
      { label: 'المتبقي', value: money(inv.remainingAmount), tone: inv.remainingAmount > 0 ? 'negative' : 'positive' },
    ],
    notes: inv.notes,
    signatures: ['توقيع المورد', 'المستلم', 'ختم الشركة'],
  };
}

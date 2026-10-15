import { environment } from '../../../../environments/environment';
import {
  caption,
  docHeader,
  fieldGrid,
  html,
  metricCards,
  pageFooter,
  runningHeader,
} from '../../../core/pdf/pdf-blocks';
import { PdfBlock, PdfLayout, PdfTableBlock } from '../../../core/pdf/pdf.models';
import {
  escapeHtml as esc,
  formatPrintCurrency as money,
  formatPrintDate as date,
} from '../../../core/utils/print-format.util';
import {
  ContractDetails,
  ContractInstallmentRow,
} from '../../customers/models/client-statement.model';
import {
  CONTRACT_STATUS_LABELS,
  INSTALLMENT_STATUS_VIEW,
  PAYMENT_FREQUENCY_MONTHS,
  paymentFrequencyLabel,
} from '../constants/contract-labels';

const TITLE = 'عقد تقسيط';

/**
 * Contract document sent to the client:
 *  1. a summary page — parties, contract figures, full installment schedule;
 *  2. one receipt page per installment (the same receipts the office prints
 *     and hands over on each collection).
 * A5 landscape, matching the physical receipt book.
 */
export function buildContractLayout(details: ContractDetails): PdfLayout {
  const { contract, client, summary } = details;
  const installments = [...(details.installments ?? [])].sort((a, b) => a.sequence - b.sequence);
  const product = productLabel(details);
  const freq = paymentFrequencyLabel(contract.paymentFrequency);
  const remainingAfter = remainingAfterEach(installments, summary.totalContractAmount);

  const blocks: PdfBlock[] = [
    docHeader({
      title: TITLE,
      subtitle: client.fullName,
      reference: `عقد رقم ${contract.id}`,
      status: { label: CONTRACT_STATUS_LABELS[contract.status] ?? contract.status, tone: 'accent' },
    }),
    fieldGrid([
      { label: 'العميل', value: client.fullName },
      { label: 'الهاتف', value: client.phoneNumber },
      { label: 'العنوان', value: client.address },
      { label: 'المندوب', value: details.representative?.fullName ?? '—' },
      { label: 'المنتج', value: product },
      { label: 'تاريخ البيع', value: date(contract.dateOfSale) },
      { label: 'بداية الأقساط', value: date(contract.firstInstallmentDate) },
      { label: 'نظام السداد', value: freq },
    ]),
    metricCards([
      { label: 'إجمالي العقد', value: money(summary.totalContractAmount), emphasis: true },
      { label: 'المقدم', value: money(contract.downPayment) },
      { label: 'الأقساط', value: `${contract.installmentsCount} × ${money(contract.installmentAmount)}` },
      { label: 'المتبقي', value: money(summary.totalRemaining), tone: summary.totalRemaining > 0 ? 'negative' : 'positive' },
    ]),
    scheduleTable(installments, contract.firstInstallmentDate, contract.paymentFrequency),
  ];

  installments.forEach((inst) => {
    blocks.push(html(receipt(details, inst, {
      product,
      freq,
      dueDate: dueDateOf(inst, contract.firstInstallmentDate, contract.paymentFrequency),
      remainingAfter: remainingAfter.get(inst.sequence) ?? 0,
    }), true));
  });

  return {
    format: 'a5',
    orientation: 'landscape',
    css: CONTRACT_CSS,
    runningHeader: runningHeader(`${TITLE} رقم ${contract.id}`, client.fullName),
    footer: pageFooter(`${TITLE} رقم ${contract.id}`),
    blocks,
  };
}

// ─────────── sections ───────────

function scheduleTable(
  installments: ReadonlyArray<ContractInstallmentRow>,
  firstDate: string,
  frequency: string,
): PdfTableBlock {
  const rows = installments.map((inst) => {
    const status = INSTALLMENT_STATUS_VIEW[inst.isOverdue ? 'Overdue' : inst.status]
      ?? { label: inst.status, tone: 'default' as const };
    return `
      <tr>
        <td class="ta-center b">${inst.sequence}</td>
        <td class="ta-center num">${esc(dueDateOf(inst, firstDate, frequency))}</td>
        <td class="ta-end num b">${esc(money(inst.dueAmount))}</td>
        <td class="ta-end num">${esc(money(inst.paidAmount))}</td>
        <td class="ta-end num">${esc(money(inst.remaining))}</td>
        <td class="ta-center"><span class="tag tag-${status.tone}">${esc(status.label)}</span></td>
      </tr>`;
  });

  return {
    kind: 'table',
    caption: caption(`جدول الأقساط (${installments.length})`),
    colgroup: '<colgroup><col style="width:9%"><col style="width:19%"><col><col><col><col style="width:17%"></colgroup>',
    head: `
      <tr>
        <th class="ta-center">القسط</th>
        <th class="ta-center">تاريخ الاستحقاق</th>
        <th class="ta-end">قيمة القسط</th>
        <th class="ta-end">المدفوع</th>
        <th class="ta-end">المتبقي</th>
        <th class="ta-center">الحالة</th>
      </tr>`,
    rows,
    emptyRow: '<tr class="row-empty"><td colspan="6">لا توجد أقساط على هذا العقد</td></tr>',
  };
}

function receipt(
  details: ContractDetails,
  inst: ContractInstallmentRow,
  ctx: { product: string; freq: string; dueDate: string; remainingAfter: number },
): string {
  const { contract, client } = details;
  const status = INSTALLMENT_STATUS_VIEW[inst.isOverdue ? 'Overdue' : inst.status];

  return `
    <article class="rc">
      <header class="rc-head">
        <div class="brand">
          <div class="brand-mark">${esc(environment.appName.trim().charAt(0))}</div>
          <div>
            <div class="brand-name">${esc(environment.appName)}</div>
            <div class="brand-tag">إيصال استلام قسط</div>
          </div>
        </div>
        <div class="rc-seq">
          <div class="rc-seq-label">القسط</div>
          <div class="rc-seq-value">${inst.sequence}<span> / ${contract.installmentsCount}</span></div>
        </div>
      </header>

      <section class="rc-fields">
        ${rcField('العميل', client.fullName, 'wide')}
        ${rcField('الهاتف', client.phoneNumber)}
        ${rcField('رقم العقد', `#${contract.id}`)}
        ${rcField('العنوان', client.address || '—', 'wide')}
        ${rcField('المندوب', details.representative?.fullName ?? '—')}
        ${rcField('تاريخ البيع', date(contract.dateOfSale))}
        ${rcField('المنتج', ctx.product, 'full')}
      </section>

      <section class="rc-money">
        <div class="rc-amount">
          <div class="rc-amount-label">قيمة القسط</div>
          <div class="rc-amount-value">${esc(money(inst.dueAmount))}</div>
        </div>
        <div class="rc-fact">
          <div class="rc-fact-label">تاريخ الاستحقاق</div>
          <div class="rc-fact-value">${esc(ctx.dueDate)}</div>
        </div>
        <div class="rc-fact">
          <div class="rc-fact-label">المتبقي بعد هذا القسط</div>
          <div class="rc-fact-value">${esc(money(ctx.remainingAfter))}</div>
        </div>
        <div class="rc-fact">
          <div class="rc-fact-label">الحالة</div>
          <div class="rc-fact-value">${status ? `<span class="tag tag-${status.tone}">${esc(status.label)}</span>` : esc(inst.status)}</div>
        </div>
      </section>

      <div class="rc-strip">
        <span>إجمالي العقد: <b>${esc(money(details.summary.totalContractAmount))}</b></span>
        <span>المقدم: <b>${esc(money(contract.downPayment))}</b></span>
        <span>نظام السداد: <b>${esc(ctx.freq)}</b></span>
        <span>بداية الأقساط: <b>${esc(date(contract.firstInstallmentDate))}</b></span>
      </div>

      <section class="signatures rc-sign" style="--cols:3">
        <div class="signature">توقيع العميل</div>
        <div class="signature">توقيع المندوب</div>
        <div class="signature">ختم الشركة</div>
      </section>
    </article>`;
}

function rcField(label: string, value: string, span: 'wide' | 'full' | '' = ''): string {
  return `
    <div class="rc-field${span ? ` rc-${span}` : ''}">
      <span class="rc-field-label">${esc(label)}</span>
      <span class="rc-field-value">${esc(value || '—')}</span>
    </div>`;
}

// ─────────── calculations ───────────

/** First item, with "+N" when the contract has several lines. */
function productLabel(details: ContractDetails): string {
  const items = details.items ?? [];
  if (items.length === 0) return '—';
  const first = items[0];
  const qty = first.quantity > 1 ? ` (عدد ${first.quantity})` : '';
  const more = items.length > 1 ? ` + ${items.length - 1} منتجات أخرى` : '';
  return `${first.productName}${qty}${more}`;
}

/** Balance left on the contract once each installment is settled. */
function remainingAfterEach(
  installments: ReadonlyArray<ContractInstallmentRow>,
  total: number,
): Map<number, number> {
  const result = new Map<number, number>();
  let settled = 0;
  for (const inst of installments) {
    settled += inst.dueAmount ?? 0;
    result.set(inst.sequence, Math.max(0, total - settled));
  }
  return result;
}

/** The API's due date, or one derived from the schedule when it's missing. */
function dueDateOf(inst: ContractInstallmentRow, firstDate: string, frequency: string): string {
  if (inst.dueDate) return date(inst.dueDate);
  if (!firstDate) return '—';
  const d = new Date(firstDate);
  d.setMonth(d.getMonth() + (inst.sequence - 1) * (PAYMENT_FREQUENCY_MONTHS[frequency] ?? 1));
  return date(d);
}

// ─────────── styles ───────────

const CONTRACT_CSS = `
  .rc {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1.5px solid var(--line-strong);
    border-radius: 12px;
    padding: 12px 14px 10px;
  }
  .rc-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 9px;
    border-bottom: 2px solid var(--brand);
  }
  .rc-head .brand-mark { width: 36px; height: 36px; font-size: 19px; border-radius: 9px; }
  .rc-head .brand-name { font-size: 15px; }
  .rc-seq {
    text-align: center;
    background: var(--brand);
    color: #fff;
    border-radius: 10px;
    padding: 3px 16px 2px;
    border-bottom: 3px solid var(--gold);
  }
  .rc-seq-label { font-size: 9px; color: #c9d2e3; font-weight: 600; }
  .rc-seq-value { font-size: 20px; font-weight: 800; line-height: 1.1; }
  .rc-seq-value span { font-size: 12px; color: #c9d2e3; font-weight: 700; }

  .rc-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 10px; }
  .rc-field {
    display: flex;
    flex-direction: column;
    border-bottom: 1px dotted var(--line-strong);
    padding-bottom: 3px;
  }
  .rc-wide { grid-column: span 2; }
  .rc-full { grid-column: 1 / -1; }
  .rc-field-label { font-size: 9px; color: var(--muted); font-weight: 600; }
  .rc-field-value { font-size: 11.5px; font-weight: 700; color: var(--ink); }

  .rc-money { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 8px; }
  .rc-amount {
    background: var(--brand);
    color: #fff;
    border-radius: 10px;
    padding: 7px 12px;
    border-right: 4px solid var(--gold);
  }
  .rc-amount-label { font-size: 9.5px; color: #c9d2e3; font-weight: 600; }
  .rc-amount-value { font-size: 20px; font-weight: 800; line-height: 1.25; }
  .rc-fact { border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; background: var(--surface); }
  .rc-fact-label { font-size: 9px; color: var(--muted); font-weight: 600; }
  .rc-fact-value { font-size: 12px; font-weight: 800; color: var(--ink); line-height: 1.5; }

  .rc-strip {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--brand-soft);
    color: var(--ink-2);
    font-size: 10px;
  }
  .rc-strip b { color: var(--brand); }
  .rc-sign { margin-top: auto; padding-top: 4px; }
  .rc-sign .signature::before { height: 26px; }
`;

import { environment } from '../../../environments/environment';
import {
  PrintColumn,
  PrintTotals,
  escapeHtml as esc,
  formatPrintCell,
  formatPrintDateTime,
} from '../utils/print-format.util';
import { PdfField, PdfHtmlBlock, PdfMetric, PdfTableBlock, PdfTone } from './pdf.models';

/**
 * Building blocks shared by every document template. Each returns trusted
 * markup; every dynamic value goes through `esc()` here, so templates only
 * pass plain data.
 */

export function html(markup: string, pageBreakBefore = false): PdfHtmlBlock {
  return { kind: 'html', html: markup, pageBreakBefore };
}

export interface DocHeaderOptions {
  readonly title: string;
  readonly subtitle?: string;
  readonly reference?: string;
  readonly status?: { readonly label: string; readonly tone: PdfTone };
}

/** Brand on the start side, document identity on the end side. */
export function docHeader(opts: DocHeaderOptions): PdfHtmlBlock {
  const tags = [
    opts.reference ? `<span class="tag tag-accent">${esc(opts.reference)}</span>` : '',
    opts.status ? `<span class="tag tag-${opts.status.tone}">${esc(opts.status.label)}</span>` : '',
  ].join('');

  return html(`
    <header class="doc-head">
      <div class="brand">
        <div class="brand-mark">${esc(brandInitial())}</div>
        <div>
          <div class="brand-name">${esc(environment.appName)}</div>
          <div class="brand-tag">نظام إدارة التقسيط والحسابات</div>
        </div>
      </div>
      <div class="doc-id">
        <h1 class="doc-title">${esc(opts.title)}</h1>
        ${opts.subtitle ? `<div class="doc-sub">${esc(opts.subtitle)}</div>` : ''}
        ${tags ? `<div class="doc-tags">${tags}</div>` : ''}
      </div>
    </header>`);
}

/** Compact identity bar for pages 2…n. */
export function runningHeader(title: string, subtitle?: string): string {
  return `<b>${esc(environment.appName)}</b><span>${esc(title)}${subtitle ? ` — ${esc(subtitle)}` : ''}</span>`;
}

/** Issue stamp + page counter (`{{page}}`/`{{pages}}` are filled by the paginator). */
export function pageFooter(title: string): string {
  return `
    <span>${esc(environment.appName)} — ${esc(title)}</span>
    <span class="pg-num">صفحة {{page}} من {{pages}}</span>
    <span>تاريخ الإصدار: ${esc(formatPrintDateTime(new Date()))}</span>`;
}

export function fieldGrid(fields: ReadonlyArray<PdfField>, columns = 4): PdfHtmlBlock {
  const cols = Math.max(1, Math.min(columns, fields.length));
  const cells = fields.map((f, i) => {
    const cls = ['field', i % cols === 0 ? 'first-col' : '', i < cols ? 'first-row' : ''].join(' ');
    return `
      <div class="${cls}">
        <div class="field-label">${esc(f.label)}</div>
        <div class="field-value">${esc(f.value || '—')}</div>
      </div>`;
  });
  // Pad the last row so its borders line up with the rows above.
  const pad = (cols - (fields.length % cols)) % cols;
  for (let i = 0; i < pad; i++) {
    const idx = fields.length + i;
    cells.push(`<div class="field${idx % cols === 0 ? ' first-col' : ''}${idx < cols ? ' first-row' : ''}"></div>`);
  }
  return html(`<section class="fields" style="--cols:${cols}">${cells.join('')}</section>`);
}

export function metricCards(metrics: ReadonlyArray<PdfMetric>, columns = 4): PdfHtmlBlock {
  const cols = Math.max(1, Math.min(columns, metrics.length));
  const cards = metrics.map((m) => `
    <div class="metric tone-${m.tone ?? 'default'}${m.emphasis ? ' emphasis' : ''}">
      <div class="metric-label">${esc(m.label)}</div>
      <div class="metric-value">${esc(m.value)}</div>
    </div>`);
  return html(`<section class="metrics" style="--cols:${cols}">${cards.join('')}</section>`);
}

export function totalsBox(rows: ReadonlyArray<PdfMetric>): PdfHtmlBlock {
  const body = rows.map((r) => `
    <div class="totals-row tone-${r.tone ?? 'default'}${r.emphasis ? ' emphasis' : ''}">
      <span>${esc(r.label)}</span><span class="v">${esc(r.value)}</span>
    </div>`);
  return html(`<section class="totals"><div class="totals-box">${body.join('')}</div></section>`);
}

export function notesBlock(text: string, label = 'ملاحظات'): PdfHtmlBlock {
  return html(`
    <section class="notes">
      <div class="notes-label">${esc(label)}</div>
      <div class="notes-body">${esc(text)}</div>
    </section>`);
}

export function signaturesBlock(labels: ReadonlyArray<string>): PdfHtmlBlock {
  const cells = labels.map((l) => `<div class="signature">${esc(l)}</div>`).join('');
  return html(`<section class="signatures" style="--cols:${labels.length}">${cells}</section>`);
}

export function caption(text: string): string {
  return `<div class="caption">${esc(text)}</div>`;
}

/** Turns print-style column definitions into a paginatable table block. */
export function dataTable<T>(opts: {
  readonly columns: ReadonlyArray<PrintColumn<T>>;
  readonly rows: ReadonlyArray<T>;
  readonly totals?: PrintTotals;
  readonly caption?: string;
  readonly emptyMessage?: string;
}): PdfTableBlock {
  const { columns } = opts;
  const align = (c: PrintColumn<T>) => `ta-${c.align ?? 'start'}`;

  const colgroup = columns.some((c) => c.width)
    ? `<colgroup>${columns.map((c) => `<col${c.width ? ` style="width:${esc(c.width)}"` : ''}>`).join('')}</colgroup>`
    : undefined;

  const head = `<tr>${columns.map((c) => `<th class="${align(c)}">${esc(c.header)}</th>`).join('')}</tr>`;

  const rows = opts.rows.map((row) =>
    `<tr>${columns
      .map((c) => `<td class="${align(c)}${c.bold ? ' b' : ''} num">${esc(formatPrintCell(c, row))}</td>`)
      .join('')}</tr>`,
  );

  return {
    kind: 'table',
    caption: opts.caption ? caption(opts.caption) : undefined,
    colgroup,
    head,
    rows,
    foot: opts.totals ? [totalsRow(columns.length, opts.totals)] : undefined,
    emptyRow: `<tr class="row-empty"><td colspan="${columns.length}">${esc(opts.emptyMessage ?? 'لا توجد بيانات')}</td></tr>`,
  };
}

function totalsRow(columnCount: number, totals: PrintTotals): string {
  const labelSpan = Math.max(1, totals.labelColSpan ?? 1);
  const remaining = Math.max(0, columnCount - labelSpan);
  const cells = [...totals.cells.slice(0, remaining)];
  while (cells.length < remaining) cells.push(null);
  return `
    <tr class="row-total">
      <td colspan="${labelSpan}">${esc(totals.label ?? 'الإجمالي')}</td>
      ${cells.map((v) => `<td class="ta-end num">${esc(v ?? '')}</td>`).join('')}
    </tr>`;
}

function brandInitial(): string {
  return environment.appName.trim().charAt(0) || '•';
}

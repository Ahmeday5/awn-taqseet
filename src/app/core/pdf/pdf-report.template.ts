import type { PrintConfig } from '../services/print.service';
import {
  dataTable,
  docHeader,
  fieldGrid,
  metricCards,
  notesBlock,
  pageFooter,
  runningHeader,
  signaturesBlock,
  totalsBox,
} from './pdf-blocks';
import { PdfBlock, PdfLayout, PdfMetric, PdfReport } from './pdf.models';

/** Lays a {@link PdfReport} out as: header → details → key figures → table → totals → notes → signatures. */
export function buildReportLayout<T>(report: PdfReport<T>): PdfLayout {
  const orientation = report.orientation ?? 'portrait';
  const wide = orientation === 'landscape';
  const blocks: PdfBlock[] = [
    docHeader({
      title: report.title,
      subtitle: report.subtitle,
      reference: report.reference,
      status: report.status,
    }),
  ];

  if (report.fields?.length) blocks.push(fieldGrid(report.fields, wide ? 5 : 4));
  if (report.metrics?.length) blocks.push(metricCards(report.metrics, wide ? 5 : 4));
  if (report.table) {
    blocks.push(dataTable({
      columns: report.table.columns,
      rows: report.table.rows,
      totals: report.table.totals,
      caption: report.table.caption,
      emptyMessage: report.table.emptyMessage,
    }));
  }
  if (report.totals?.length) blocks.push(totalsBox(report.totals));
  if (report.notes?.trim()) blocks.push(notesBlock(report.notes.trim()));
  if (report.signatures?.length) blocks.push(signaturesBlock(report.signatures));

  return {
    format: 'a4',
    orientation,
    runningHeader: runningHeader(report.title, report.subtitle),
    footer: pageFooter(report.title),
    blocks,
  };
}

/**
 * Adapts an existing print configuration (what the screens already build
 * for browser printing) into a report, so every statement gets a PDF that
 * matches its printout without restating its columns.
 */
export function reportFromPrintConfig<T>(
  config: PrintConfig<T>,
  extras: { readonly metrics?: ReadonlyArray<PdfMetric>; readonly caption?: string } = {},
): PdfReport<T> {
  return {
    title: config.title,
    subtitle: config.subtitle,
    orientation: config.orientation,
    fields: config.meta,
    metrics: extras.metrics,
    table: {
      caption: extras.caption ?? `الحركات (${config.rows.length.toLocaleString('ar-EG')})`,
      columns: config.columns,
      rows: config.rows,
      totals: config.totals,
      emptyMessage: config.emptyMessage ?? 'لا توجد حركات في هذه الفترة',
    },
  };
}

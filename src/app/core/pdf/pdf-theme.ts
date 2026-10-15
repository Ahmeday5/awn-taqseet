import { PdfFormat, PdfOrientation } from './pdf.models';

/** Page box in CSS pixels (96 dpi) — the unit the layout engine measures in. */
export interface PdfPageSize {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

const PAPER_MM: Record<PdfFormat, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  a5: { w: 148, h: 210 },
};

const PX_PER_MM = 96 / 25.4;

export function pdfPageSize(format: PdfFormat, orientation: PdfOrientation): PdfPageSize {
  const paper = PAPER_MM[format];
  const [w, h] = orientation === 'landscape' ? [paper.h, paper.w] : [paper.w, paper.h];
  return {
    widthMm: w,
    heightMm: h,
    widthPx: Math.round(w * PX_PER_MM),
    heightPx: Math.round(h * PX_PER_MM),
  };
}

/** Every weight the document styles use — each must be loaded before measuring. */
export const PDF_FONT_WEIGHTS = [400, 500, 600, 700, 800] as const;

/** Same family the app loads, so documents match the dashboard's typography. */
export const PDF_FONT_URL =
  `https://fonts.googleapis.com/css2?family=Cairo:wght@${PDF_FONT_WEIGHTS.join(';')}&display=block`;

export const PDF_FONT_FAMILY = `'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif`;

/**
 * Base stylesheet for generated documents.
 *
 * Rendering constraints (the pages are rasterized by html2canvas):
 *  - no `letter-spacing`: glyphs are drawn one by one and Arabic joining breaks;
 *  - tables use `border-collapse: separate` — collapsed borders lose segments;
 *  - hairlines are ≥ 1px with solid colours so they survive downscaling;
 *  - no `inset` box-shadows: they paint as a thick frame — use borders.
 */
export function pdfBaseCss(page: PdfPageSize): string {
  return `
    :root {
      --ink: #0f172a;
      --ink-2: #334155;
      --muted: #64748b;
      --line: #dbe2ea;
      --line-strong: #c3cdd9;
      --surface: #f6f8fb;
      --brand: #1c2740;
      --brand-2: #2d3d63;
      --brand-soft: #e9edf5;
      --gold: #b8913a;
      --accent: #1d4ed8;
      --positive: #15803d;
      --negative: #b91c1c;
      --warning: #b45309;
    }
    *, *::before, *::after { box-sizing: border-box; letter-spacing: normal !important; }
    html, body {
      margin: 0;
      padding: 0;
      background: #e5e7eb;
      color: var(--ink);
      font-family: ${PDF_FONT_FAMILY};
      font-size: 11px;
      line-height: 1.55;
      direction: rtl;
      -webkit-font-smoothing: antialiased;
    }
    .pdf-root { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px 0; }

    /* ── Page frame ── */
    .pg {
      position: relative;
      width: ${page.widthPx}px;
      height: ${page.heightPx}px;
      padding: 30px 34px 22px;
      background: #fff;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .pg::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 5px;
      background: linear-gradient(90deg, var(--gold) 0%, var(--brand) 35%, var(--brand) 100%);
    }
    .pg-body { flex: 1 1 auto; min-height: 0; overflow: hidden; }
    .pg-body > * + * { margin-top: 14px; }

    .pg-running {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      font-size: 10px;
    }
    .pg-running b { color: var(--brand); font-weight: 700; }

    .pg-foot {
      flex: 0 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 9.5px;
    }
    .pg-foot .pg-num {
      color: var(--brand);
      font-weight: 700;
      background: var(--brand-soft);
      border-radius: 999px;
      padding: 1px 10px;
    }

    /* ── Document header ── */
    .doc-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 18px;
      padding-bottom: 14px;
      border-bottom: 2px solid var(--brand);
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-mark {
      width: 42px; height: 42px;
      border-radius: 11px;
      background: var(--brand);
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; font-weight: 800;
      border-bottom: 3px solid var(--gold);
    }
    .brand-name { font-size: 18px; font-weight: 800; color: var(--brand); line-height: 1.2; }
    .brand-tag { font-size: 10px; color: var(--muted); }
    .doc-id { text-align: left; }
    .doc-title { margin: 0; font-size: 19px; font-weight: 800; color: var(--ink); line-height: 1.25; }
    .doc-sub { margin-top: 2px; font-size: 12px; font-weight: 600; color: var(--ink-2); }
    .doc-tags { margin-top: 6px; display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
    .tag {
      display: inline-block;
      border-radius: 999px;
      padding: 1px 10px;
      font-size: 10px;
      font-weight: 700;
      border: 1px solid var(--line-strong);
      color: var(--ink-2);
      background: #fff;
    }
    .tag-default  { }
    .tag-accent   { color: var(--accent);   border-color: #bfd0f7; background: #eef3fe; }
    .tag-positive { color: var(--positive); border-color: #bfe3cb; background: #eef8f1; }
    .tag-negative { color: var(--negative); border-color: #f1c4c4; background: #fdf0f0; }
    .tag-warning  { color: var(--warning);  border-color: #f2d6b3; background: #fdf6ec; }

    /* ── Field grid (party details, dates…) ── */
    .fields {
      display: grid;
      grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr));
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface);
      overflow: hidden;
    }
    .field { padding: 8px 12px; border-inline-start: 1px solid var(--line); border-top: 1px solid var(--line); }
    .field.first-col { border-inline-start: 0; }
    .field.first-row { border-top: 0; }
    .field-label { font-size: 9.5px; color: var(--muted); font-weight: 600; }
    .field-value { font-size: 11.5px; color: var(--ink); font-weight: 700; word-break: break-word; }

    /* ── Key figures ── */
    .metrics { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); gap: 10px; }
    .metric {
      position: relative;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 9px 12px 9px 12px;
      background: #fff;
      overflow: hidden;
    }
    .metric::after {
      content: '';
      position: absolute;
      inset: 0 0 0 auto;
      width: 4px;
      background: var(--brand);
    }
    .metric-label { font-size: 9.5px; color: var(--muted); font-weight: 600; }
    .metric-value { font-size: 14px; font-weight: 800; color: var(--ink); line-height: 1.35; }
    .metric.tone-accent::after   { background: var(--accent); }
    .metric.tone-positive::after { background: var(--positive); }
    .metric.tone-negative::after { background: var(--negative); }
    .metric.tone-warning::after  { background: var(--warning); }
    .metric.tone-positive .metric-value { color: var(--positive); }
    .metric.tone-negative .metric-value { color: var(--negative); }
    .metric.tone-warning  .metric-value { color: var(--warning); }
    .metric.emphasis { background: var(--brand); border-color: var(--brand); }
    .metric.emphasis .metric-label { color: #c9d2e3; }
    .metric.emphasis .metric-value { color: #fff; }

    /* ── Section caption ── */
    .caption {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 800;
      color: var(--brand);
    }
    .caption::before { content: ''; width: 4px; height: 14px; border-radius: 2px; background: var(--gold); }

    /* ── Data table ── */
    .tbl {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      overflow: hidden;
      font-size: 10.5px;
    }
    .tbl th {
      background: var(--brand);
      color: #fff;
      font-weight: 700;
      font-size: 10px;
      padding: 7px 8px;
      border-inline-start: 1px solid var(--brand-2);
      white-space: nowrap;
    }
    .tbl td {
      padding: 6px 8px;
      border-top: 1px solid var(--line);
      border-inline-start: 1px solid var(--line);
      color: var(--ink);
      vertical-align: middle;
      word-break: break-word;
    }
    .tbl th:first-child, .tbl td:first-child { border-inline-start: 0; }
    .tbl tbody tr:nth-child(even) td { background: #f8fafc; }
    .tbl .ta-start  { text-align: right; }
    .tbl .ta-center { text-align: center; }
    .tbl .ta-end    { text-align: left; }
    .tbl .b { font-weight: 700; }
    .tbl .num { font-variant-numeric: tabular-nums; }
    .tbl .row-total td {
      background: var(--brand-soft) !important;
      border-top: 2px solid var(--brand);
      font-weight: 800;
      color: var(--brand);
    }
    .tbl .row-empty td { text-align: center; color: var(--muted); padding: 22px 8px; }

    /* ── Totals box ── */
    .totals { display: flex; justify-content: flex-end; }
    .totals-box { width: 46%; border: 1px solid var(--line-strong); border-radius: 10px; overflow: hidden; }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 12px;
      border-top: 1px solid var(--line);
      font-size: 11px;
    }
    .totals-row:first-child { border-top: 0; }
    .totals-row .v { font-weight: 700; }
    .totals-row.tone-positive .v { color: var(--positive); }
    .totals-row.tone-negative .v { color: var(--negative); }
    .totals-row.emphasis { background: var(--brand); color: #fff; font-size: 13px; font-weight: 800; }
    .totals-row.emphasis .v { color: #fff; }

    /* ── Notes & signatures ── */
    .notes {
      border: 1px dashed var(--line-strong);
      border-radius: 10px;
      padding: 9px 12px;
      background: #fcfdfe;
    }
    .notes-label { font-size: 9.5px; color: var(--muted); font-weight: 700; margin-bottom: 2px; }
    .notes-body { white-space: pre-wrap; color: var(--ink-2); }
    .signatures { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: 22px; padding-top: 16px; }
    .signature { text-align: center; color: var(--muted); font-size: 10px; font-weight: 600; }
    .signature::before { content: ''; display: block; height: 34px; border-bottom: 1px solid var(--ink-2); margin-bottom: 5px; }
  `;
}

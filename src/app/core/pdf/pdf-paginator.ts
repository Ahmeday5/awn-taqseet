import { PdfBlock, PdfHtmlBlock, PdfLayout, PdfTableBlock } from './pdf.models';

interface PageSlot {
  readonly page: HTMLElement;
  readonly body: HTMLElement;
}

interface OpenTable {
  readonly table: HTMLTableElement;
  readonly tbody: HTMLTableSectionElement;
}

/**
 * Pours a {@link PdfLayout}'s blocks onto fixed-size pages inside a live
 * document, measuring as it goes — so what is laid out is exactly what gets
 * rendered, with nothing clipped:
 *
 *  - html blocks are atomic: a block that doesn't fit moves to the next page;
 *  - tables split between rows, re-emitting caption-less headers on every
 *    page, and their totals rows always travel with at least one data row;
 *  - running header and footer (with page X of Y) go on every page.
 *
 * A single block taller than a whole page can't be moved anywhere useful;
 * it is kept on its own page and clipped — templates keep blocks small.
 */
export class PdfPaginator {
  private readonly pages: PageSlot[] = [];

  constructor(
    private readonly doc: Document,
    private readonly root: HTMLElement,
    private readonly layout: PdfLayout,
  ) {}

  /** Lays out every block and returns the finished page elements. */
  run(): HTMLElement[] {
    this.newPage();
    for (const block of this.layout.blocks) {
      if (block.kind === 'html') this.placeHtml(block);
      else this.placeTable(block);
    }
    this.fillFooters();
    return this.pages.map((p) => p.page);
  }

  // ─────────── blocks ───────────

  private placeHtml(block: PdfHtmlBlock): void {
    if (block.pageBreakBefore && this.current.body.childElementCount > 0) this.newPage();

    const el = this.fragment(block.html);
    this.current.body.append(el);
    if (this.overflows() && this.current.body.childElementCount > 1) {
      el.remove();
      this.newPage();
      this.current.body.append(el);
    }
  }

  private placeTable(block: PdfTableBlock): void {
    if (block.pageBreakBefore && this.current.body.childElementCount > 0) this.newPage();

    let open = this.openTable(block, true);
    const rows = block.rows.length > 0 ? block.rows : block.emptyRow ? [block.emptyRow] : [];

    for (const markup of rows) {
      const tr = this.row(markup);
      open.tbody.append(tr);
      if (!this.overflows()) continue;

      tr.remove();
      if (open.tbody.rows.length === 0) {
        // Not even one row fits under the header here: move the whole table start.
        open.table.parentElement?.remove();
      }
      this.newPage();
      open = this.openTable(block, open.tbody.rows.length === 0);
      open.tbody.append(tr);
    }

    if (block.foot?.length) this.placeFoot(block, open);
  }

  /** Totals go under the last data rows; if they don't fit, carry the last row over with them. */
  private placeFoot(block: PdfTableBlock, open: OpenTable): void {
    const tfoot = this.doc.createElement('tfoot');
    for (const markup of block.foot ?? []) tfoot.append(this.row(markup));
    open.table.append(tfoot);
    if (!this.overflows()) return;

    tfoot.remove();
    const carried = open.tbody.rows.length > 1 ? open.tbody.rows[open.tbody.rows.length - 1] : null;
    carried?.remove();
    this.newPage();
    const next = this.openTable(block, false);
    if (carried) next.tbody.append(carried);
    next.table.append(tfoot);
  }

  /** Appends `[caption] + <table><thead>` to the current page (moving to a new page if needed). */
  private openTable(block: PdfTableBlock, withCaption: boolean): OpenTable {
    const wrap = this.doc.createElement('div');
    wrap.className = 'tbl-wrap';
    if (withCaption && block.caption) wrap.append(this.fragment(block.caption));

    const table = this.doc.createElement('table');
    table.className = 'tbl';
    if (block.colgroup) table.append(this.fragment(block.colgroup));
    const thead = this.doc.createElement('thead');
    thead.append(this.row(block.head));
    const tbody = this.doc.createElement('tbody');
    table.append(thead, tbody);
    wrap.append(table);

    this.current.body.append(wrap);
    if (this.overflows() && this.current.body.childElementCount > 1) {
      wrap.remove();
      this.newPage();
      this.current.body.append(wrap);
    }
    return { table, tbody };
  }

  // ─────────── pages ───────────

  private get current(): PageSlot {
    return this.pages[this.pages.length - 1];
  }

  private newPage(): void {
    const page = this.doc.createElement('section');
    page.className = 'pg';

    if (this.pages.length > 0 && this.layout.runningHeader) {
      page.append(this.fragment(`<div class="pg-running">${this.layout.runningHeader}</div>`));
    }
    const body = this.doc.createElement('div');
    body.className = 'pg-body';
    page.append(body);
    if (this.layout.footer) {
      page.append(this.fragment(`<div class="pg-foot">${this.layout.footer}</div>`));
    }

    this.root.append(page);
    this.pages.push({ page, body });
  }

  private fillFooters(): void {
    const total = String(this.pages.length);
    this.pages.forEach(({ page }, i) => {
      const foot = page.querySelector('.pg-foot');
      if (!foot) return;
      foot.innerHTML = foot.innerHTML
        .replace(/\{\{page\}\}/g, String(i + 1))
        .replace(/\{\{pages\}\}/g, total);
    });
  }

  /** Sub-pixel tolerance: fractional line heights round differently per engine. */
  private overflows(): boolean {
    const body = this.current.body;
    return body.scrollHeight > body.clientHeight + 1;
  }

  // ─────────── markup ───────────

  private fragment(html: string): HTMLElement {
    const tpl = this.doc.createElement('template');
    tpl.innerHTML = toLatinDigits(html.trim());
    const first = tpl.content.firstElementChild;
    if (tpl.content.childElementCount === 1 && first) return first as HTMLElement;
    const wrap = this.doc.createElement('div');
    wrap.append(tpl.content);
    return wrap;
  }

  /** `<tr>` must be parsed in table context or the parser drops it. */
  private row(markup: string): HTMLTableRowElement {
    const tpl = this.doc.createElement('template');
    tpl.innerHTML = `<table><tbody>${toLatinDigits(markup.trim())}</tbody></table>`;
    const tr = tpl.content.querySelector('tr');
    if (!tr) throw new Error('PdfPaginator: table row markup must be a <tr>');
    return tr;
  }
}

const ARABIC_INDIC_DIGITS = /[٠-٩]/g;

/**
 * One digit system per document. The app's formatters mix Arabic-Indic
 * amounts (`ar-EG` locale) with Latin dates, codes and phone numbers; on
 * paper that reads as inconsistent, so documents use Latin digits
 * throughout — the convention of Egyptian commercial paperwork.
 */
function toLatinDigits(markup: string): string {
  return markup
    .replace(ARABIC_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٬/g, ',')
    .replace(/٫/g, '.');
}

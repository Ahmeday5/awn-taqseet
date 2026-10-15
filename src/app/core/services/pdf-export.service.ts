import { Injectable } from '@angular/core';
import { PdfPaginator } from '../pdf/pdf-paginator';
import { rasterizePages } from '../pdf/pdf-rasterizer';
import { buildReportLayout } from '../pdf/pdf-report.template';
import { PDF_FONT_URL, PDF_FONT_WEIGHTS, pdfBaseCss, pdfPageSize } from '../pdf/pdf-theme';
import { PdfLayout, PdfReport } from '../pdf/pdf.models';

export { PdfTooLargeError } from '../pdf/pdf-rasterizer';

/**
 * Wavex caps the request body at 5MB and the backend at ~3.5MB of PDF; the
 * cap applies to the base64 that travels (leaves room for the JSON wrapper).
 */
const MAX_BASE64_LENGTH = 4_500_000;

/** Give up on the web font rather than hang the send (system Arabic fonts take over). */
const FONT_TIMEOUT_MS = 4_000;

const HOST_FONT_LINK_ID = 'pdf-export-fonts';

/**
 * Produces real PDF files (raw base64) from document templates — for
 * sending out of the browser, e.g. over WhatsApp.
 *
 * Pipeline: template → {@link PdfLayout} → paginated into fixed-size pages
 * in a hidden frame ({@link PdfPaginator}) → each page rasterized at print
 * resolution ({@link rasterizePages}). Rendering through the browser keeps
 * Arabic shaping and RTL exactly right; the PDF libraries load on demand.
 */
@Injectable({ providedIn: 'root' })
export class PdfExportService {
  renderReport<T>(report: PdfReport<T>): Promise<string> {
    return this.render(buildReportLayout(report));
  }

  async render(layout: PdfLayout): Promise<string> {
    const page = pdfPageSize(layout.format, layout.orientation);
    await this.ensureHostFonts();
    const frame = this.createFrame(page.widthPx + 32);
    try {
      const doc = await this.loadFrame(frame, `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="${PDF_FONT_URL}">
  <style>${pdfBaseCss(page)}</style>
  ${layout.css ? `<style>${layout.css}</style>` : ''}
</head>
<body><main class="pdf-root"></main></body>
</html>`);

      const root = doc.querySelector<HTMLElement>('.pdf-root');
      if (!root) throw new Error('PDF frame is missing its root');
      const pages = new PdfPaginator(doc, root, layout).run();

      // Let html2canvas see every page inside the frame's viewport.
      frame.style.height = `${doc.documentElement.scrollHeight}px`;
      await nextFrame(doc);

      return await rasterizePages(pages, {
        format: layout.format,
        orientation: layout.orientation,
        page,
        maxBase64Length: MAX_BASE64_LENGTH,
      });
    } finally {
      frame.remove();
    }
  }

  // ─────────── fonts ───────────

  /**
   * html2canvas lays words out from the frame's DOM but paints them on a
   * canvas owned by *this* document, with this document's fonts. If a weight
   * is missing here (the app only loads Cairo up to 700), painted words come
   * out wider/narrower than their slots — run together or gapped. Loading the
   * exact same faces here keeps paint and layout identical.
   */
  private async ensureHostFonts(): Promise<void> {
    if (!document.getElementById(HOST_FONT_LINK_ID)) {
      const link = document.createElement('link');
      link.id = HOST_FONT_LINK_ID;
      link.rel = 'stylesheet';
      link.href = PDF_FONT_URL;
      document.head.appendChild(link);
      await new Promise<void>((resolve) => {
        link.onload = link.onerror = () => resolve();
      });
    }
    await waitForFonts(document);
  }

  // ─────────── frame ───────────

  private createFrame(widthPx: number): HTMLIFrameElement {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('title', 'تجهيز ملف PDF');
    frame.style.cssText = [
      'position:fixed',
      'left:-30000px',
      'top:0',
      `width:${widthPx}px`,
      'height:1200px',
      'border:0',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(frame);
    return frame;
  }

  /** Resolves once the frame's document and its fonts are ready to measure. */
  private loadFrame(frame: HTMLIFrameElement, markup: string): Promise<Document> {
    return new Promise<Document>((resolve, reject) => {
      frame.onload = async () => {
        const doc = frame.contentDocument;
        if (!doc) {
          reject(new Error('PDF frame failed to load'));
          return;
        }
        await waitForFonts(doc);
        await nextFrame(doc);
        resolve(doc);
      };
      frame.srcdoc = markup;
    });
  }
}

/** Measuring before the web font arrives would paginate with the wrong metrics. */
async function waitForFonts(doc: Document): Promise<void> {
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  const loads = Promise.all(
    PDF_FONT_WEIGHTS.map((w) => fonts.load(`${w} 12px Cairo`, 'عون 123')),
  ).then(() => fonts.ready);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
  await Promise.race([loads, timeout]).catch(() => undefined);
}

/** Two animation frames + a forced layout read so measurements are final. */
function nextFrame(doc: Document): Promise<void> {
  const win = doc.defaultView ?? window;
  return new Promise<void>((resolve) =>
    win.requestAnimationFrame(() => {
      void doc.body.offsetHeight;
      win.requestAnimationFrame(() => resolve());
    }),
  );
}

import { PdfFormat, PdfOrientation } from './pdf.models';
import { PdfPageSize } from './pdf-theme';

/** Thrown when even the most compact render exceeds the upload cap. */
export class PdfTooLargeError extends Error {
  constructor() {
    super('حجم الملف أكبر من المسموح للإرسال على واتساب. قلّل الفترة أو الفلاتر وحاول مرة أخرى.');
    this.name = 'PdfTooLargeError';
  }
}

export interface PdfRasterOptions {
  readonly format: PdfFormat;
  readonly orientation: PdfOrientation;
  readonly page: PdfPageSize;
  /** Upper bound on the base64 output length. */
  readonly maxBase64Length: number;
}

/**
 * Render profiles from sharpest to most compact. ~240 dpi first: crisp when
 * zoomed on a phone and when printed; later steps only kick in for long
 * documents that would otherwise exceed the upload cap.
 */
const PROFILES: ReadonlyArray<{ scale: number; quality: number }> = [
  { scale: 2.5, quality: 0.9 },
  { scale: 2, quality: 0.85 },
  { scale: 1.6, quality: 0.8 },
  { scale: 1.3, quality: 0.72 },
];

/** Bytes jsPDF adds per page/document, plus the JSON envelope — headroom for the estimate. */
const OVERHEAD_RATIO = 1.04;

/**
 * Snapshots each laid-out page and assembles them into a PDF, one image per
 * page at the exact paper size. Each profile aborts as soon as its running
 * size passes the cap, so an oversized first attempt costs little.
 */
export async function rasterizePages(
  pages: ReadonlyArray<HTMLElement>,
  opts: PdfRasterOptions,
): Promise<string> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas-pro'),
  ]);

  for (const profile of PROFILES) {
    const images: string[] = [];
    let estimated = 0;

    for (const page of pages) {
      const canvas = await html2canvas(page, {
        scale: profile.scale,
        backgroundColor: '#ffffff',
        width: opts.page.widthPx,
        height: opts.page.heightPx,
        windowWidth: opts.page.widthPx,
        logging: false,
      });
      const jpeg = canvas.toDataURL('image/jpeg', profile.quality);
      canvas.width = canvas.height = 0; // release the bitmap early
      images.push(jpeg);
      estimated += jpeg.length * OVERHEAD_RATIO;
      if (estimated > opts.maxBase64Length) break;
    }
    if (estimated > opts.maxBase64Length) continue;

    const pdf = new jsPDF({ unit: 'mm', format: opts.format, orientation: opts.orientation, compress: true });
    images.forEach((img, i) => {
      if (i > 0) pdf.addPage(opts.format, opts.orientation);
      pdf.addImage(img, 'JPEG', 0, 0, opts.page.widthMm, opts.page.heightMm, undefined, 'FAST');
    });
    const base64 = pdf.output('datauristring').split(',')[1] ?? '';
    if (base64.length <= opts.maxBase64Length) return base64;
  }

  throw new PdfTooLargeError();
}

/**
 * Builds the schedule PDF in the browser (ported from almagles-schedule), so the
 * result is the same everywhere: some "print to PDF" drivers drop clickable
 * links or mirror right-to-left pages.
 *
 * Each week's print layout (see PrintWeek) is captured as an image and placed
 * on landscape A4 pages; every link gets a clickable area on top. The two
 * libraries are loaded only when someone actually exports.
 */

const PAGE_W = 297; // mm, A4 landscape
const PAGE_H = 210;
const MARGIN = 8;
const PIXEL_RATIO = 2;

/**
 * The page's web fonts, inlined once per session. html-to-image would otherwise
 * re-download and re-encode every Arabic font subset for each week captured.
 */
let fontEmbedCss: Promise<string> | null = null;

interface LinkBox {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function collectLinks(root: HTMLElement): LinkBox[] {
  const origin = root.getBoundingClientRect();
  const boxes: LinkBox[] = [];
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    // A link that wraps gets one clickable area per line.
    for (const r of Array.from(a.getClientRects())) {
      if (r.width && r.height) boxes.push({ url: a.href, x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
    }
  });
  return boxes;
}

/** Y offsets where a page may be cut without slicing through a row. */
function collectCutPoints(root: HTMLElement): number[] {
  const top = root.getBoundingClientRect().top;
  const cuts = Array.from(root.querySelectorAll('[data-pdf-row]'))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 0)
    .map((r) => r.bottom - top);
  return [...new Set(cuts)].sort((a, b) => a - b);
}

/** One page per week (more when a week is taller than a page). */
export async function exportWeeksPdf(weeks: HTMLElement[], filename: string): Promise<void> {
  const [{ jsPDF }, { toCanvas, getFontEmbedCSS }] = await Promise.all([import('jspdf'), import('html-to-image')]);
  await document.fonts?.ready;
  if (weeks.length === 0) return;
  fontEmbedCss ??= getFontEmbedCSS(weeks[0]).catch((err) => {
    fontEmbedCss = null; // retry next time rather than caching the failure
    throw err;
  });
  const fontCss = await fontEmbedCss;

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const contentW = PAGE_W - MARGIN * 2;
  const contentH = PAGE_H - MARGIN * 2;
  let firstPage = true;

  for (const root of weeks) {
    const rootW = root.scrollWidth;
    const rootH = root.scrollHeight;
    const links = collectLinks(root);
    const cuts = collectCutPoints(root);
    const canvas = await toCanvas(root, {
      pixelRatio: PIXEL_RATIO,
      backgroundColor: '#fffbf3',
      width: rootW,
      height: rootH,
      fontEmbedCSS: fontCss,
    });

    const mmPerPx = contentW / rootW;
    const pageHeightPx = contentH / mmPerPx;

    let sliceTop = 0;
    while (sliceTop < rootH - 1) {
      let sliceBottom = rootH;
      if (rootH - sliceTop > pageHeightPx) {
        const fitting = cuts.filter((c) => c > sliceTop && c - sliceTop <= pageHeightPx);
        sliceBottom = fitting.length > 0 ? fitting[fitting.length - 1] : sliceTop + pageHeightPx;
      }
      const sliceH = sliceBottom - sliceTop;

      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.ceil(sliceH * PIXEL_RATIO);
      const ctx = slice.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      ctx.fillStyle = '#fffbf3';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, -sliceTop * PIXEL_RATIO);

      if (!firstPage) pdf.addPage();
      firstPage = false;
      pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', MARGIN, MARGIN, contentW, sliceH * mmPerPx);

      for (const link of links) {
        const mid = link.y + link.h / 2;
        if (mid < sliceTop || mid >= sliceBottom) continue;
        pdf.link(MARGIN + link.x * mmPerPx, MARGIN + (link.y - sliceTop) * mmPerPx, link.w * mmPerPx, link.h * mmPerPx, {
          url: link.url,
        });
      }
      sliceTop = sliceBottom;
    }
  }

  pdf.save(filename);
}

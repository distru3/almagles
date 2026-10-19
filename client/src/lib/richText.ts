/**
 * Plain post/note/comment text → runs of plain text, Quranic verses ﴿ … ﴾,
 * hadith (( … )) and clickable links. Formatting is only ever these markers in
 * the text itself, so nothing writers type can inject HTML.
 */

import { nextLink } from './links';

export { hrefFor } from './links';

export type RichKind = 'plain' | 'ayah' | 'hadith' | 'link';
export interface RichPart {
  kind: RichKind;
  text: string;
  href?: string;
}
/** A verse or hadith still open at the end of a piece of text (it continues on the next line/point). */
export type OpenMark = null | 'ayah' | 'hadith';

export const AYAH_OPEN = '﴿';
export const AYAH_CLOSE = '﴾';
export const HADITH_OPEN = '((';
export const HADITH_CLOSE = '))';

/** Share-tracking parameters that only add noise to a displayed link (the href keeps them). */
const TRACKING = /^(si|feature|pp|utm_[a-z]+|fbclid|gclid|igsh|igshid|mibextid|ref_src)$/i;

/** "https://www.example.com/a/b/?si=x" → "example.com/a/b", decoded and shortened for reading. */
export function displayUrl(href: string, max = 48): string {
  let shown = href;
  try {
    const u = new URL(href);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING.test(key)) u.searchParams.delete(key);
    }
    shown = u.toString();
  } catch {
    /* keep as is */
  }
  let text = shown.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  try {
    text = decodeURI(text);
  } catch {
    /* leave encoded */
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function splitRich(text: string, open: OpenMark = null): { parts: RichPart[]; open: OpenMark } {
  const parts: RichPart[] = [];
  const push = (kind: RichKind, t: string, href?: string) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last && last.kind === kind && kind !== 'link') last.text += t;
    else parts.push(href ? { kind, text: t, href } : { kind, text: t });
  };

  let i = 0;
  // Where to look for a hadith's closing "))" (after its own opening "((").
  let searchFrom = 0;
  while (i < text.length) {
    if (open === 'ayah') {
      const close = text.indexOf(AYAH_CLOSE, i);
      const end = close === -1 ? text.length : close + 1;
      push('ayah', text.slice(i, end));
      open = close === -1 ? 'ayah' : null;
      i = end;
      continue;
    }
    if (open === 'hadith') {
      const close = text.indexOf(HADITH_CLOSE, Math.max(i, searchFrom));
      let end = text.length;
      if (close !== -1) {
        // "((قال (ﷺ)))": the hadith ends at the last ")" of the run.
        end = close;
        while (text[end] === ')') end++;
      }
      push('hadith', text.slice(i, end));
      open = close === -1 ? 'hadith' : null;
      i = end;
      continue;
    }

    const ayah = text.indexOf(AYAH_OPEN, i);
    const hadith = text.indexOf(HADITH_OPEN, i);
    const link = nextLink(text, i);
    const candidates = [ayah === -1 ? Infinity : ayah, hadith === -1 ? Infinity : hadith, link ? link.index : Infinity];
    const next = Math.min(...candidates);
    if (next === Infinity) {
      push('plain', text.slice(i));
      break;
    }
    push('plain', text.slice(i, next));
    i = next;
    if (next === candidates[0]) {
      open = 'ayah';
    } else if (next === candidates[1]) {
      open = 'hadith';
      searchFrom = i + HADITH_OPEN.length;
    } else {
      push('link', link!.raw, link!.href);
      i += link!.raw.length;
    }
  }
  return { parts, open };
}

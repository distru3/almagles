/**
 * Plain post/note/comment text → runs of plain text, Quranic verses ﴿ … ﴾,
 * hadith (( … )) and clickable links. Formatting is only ever these markers in
 * the text itself, so nothing writers type can inject HTML.
 */

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

// Same rules as the server's extractUrls (server/src/lib/linkPreview.ts).
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'«»﴿﴾]+/giu;
const TRAILING = /[.,،؛:;!?؟'"\])}]+$/u;

/** Drop punctuation that ends the sentence rather than the link. */
function trimUrl(raw: string): string {
  while (TRAILING.test(raw)) {
    const last = raw.at(-1)!;
    // Keep a closing bracket that belongs to the link, e.g. a Wikipedia "(…)" page.
    if (last === ')' && (raw.match(/\(/g)?.length ?? 0) >= (raw.match(/\)/g)?.length ?? 0)) break;
    raw = raw.slice(0, -1);
  }
  return raw;
}

export function hrefFor(raw: string): string | null {
  const href = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "https://www.example.com/a/b/" → "example.com/a/b", decoded and shortened for reading. */
export function displayUrl(href: string, max = 48): string {
  let text = href.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
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
    URL_RE.lastIndex = i;
    const url = URL_RE.exec(text);
    const candidates = [
      ayah === -1 ? Infinity : ayah,
      hadith === -1 ? Infinity : hadith,
      url ? url.index : Infinity,
    ];
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
      const raw = trimUrl(url![0]);
      const href = hrefFor(raw);
      if (href) push('link', raw, href);
      else push('plain', raw);
      i += raw.length || 1;
    }
  }
  return { parts, open };
}

/**
 * Finding links in what people write. The browser uses this to make links
 * clickable and the server to fetch their previews, so the SAME file lives at
 * client/src/lib/links.ts and server/src/lib/links.ts; a test fails if the two
 * copies ever differ. Edit both together.
 *
 * Recognised:
 *   https://… and http://…           any address with a scheme
 *   www.example.com/…                 www. without a scheme
 *   youtu.be/abc, example.com/page    bare lowercase domains with a common ending
 * Not links: emails (a@b.com), words like Node.js, numbers like 3.14.
 */

const STOP = `\\s<>"'«»﴿﴾`;
const SCHEME_RE = new RegExp(`(?:https?:\\/\\/|www\\.)[^${STOP}]+`, 'giu');

// Common endings: generic, Arab-world country codes, and short-link hosts (youtu.be, bit.ly, goo.gl…).
const TLDS = [
  'com', 'org', 'net', 'edu', 'gov', 'info', 'io', 'co', 'me', 'be', 'ly', 'gl', 'tv', 'app', 'dev', 'ai', 'so', 'to', 'fm',
  'link', 'site', 'online', 'store', 'blog', 'news', 'uk', 'us', 'de', 'fr', 'tr', 'pk', 'in',
  'sa', 'eg', 'ae', 'qa', 'kw', 'jo', 'ma', 'tn', 'dz', 'iq', 'sy', 'lb', 'om', 'bh', 'ps', 'ye', 'sd',
].join('|');
// Lowercase only, so "ASP.NET" or "Example.Com" in prose isn't mistaken for a link.
const BARE_RE = new RegExp(`(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})(?![a-z0-9-])(?:[/?#][^${STOP}]*)?`, 'gu');
// A bare domain must not continue a word, an email or a path.
const BARE_BEFORE_BAD = /[A-Za-z0-9@._\-/:]/;

const TRAILING = /[.,،؛:;!?؟'"\])}]+$/u;

/** Drop punctuation that ends the sentence rather than the link. */
export function trimUrl(raw: string): string {
  while (TRAILING.test(raw)) {
    const last = raw.at(-1)!;
    // Keep a closing bracket that belongs to the link, e.g. a Wikipedia "(…)" page.
    if (last === ')' && (raw.match(/\(/g)?.length ?? 0) >= (raw.match(/\)/g)?.length ?? 0)) break;
    raw = raw.slice(0, -1);
  }
  return raw;
}

/** The address to open for what was written: adds https:// when there's no scheme. */
export function hrefFor(raw: string): string | null {
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(href);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface FoundLink {
  /** Where the link starts in the text. */
  index: number;
  /** Exactly what was written (trailing punctuation removed). */
  raw: string;
  href: string;
}

/** The first link at or after `from`, or null. */
export function nextLink(text: string, from = 0): FoundLink | null {
  for (let start = from; start < text.length; ) {
    SCHEME_RE.lastIndex = start;
    const scheme = SCHEME_RE.exec(text);
    BARE_RE.lastIndex = start;
    let bare = BARE_RE.exec(text);
    while (bare && bare.index > 0 && BARE_BEFORE_BAD.test(text[bare.index - 1])) {
      BARE_RE.lastIndex = bare.index + 1;
      bare = BARE_RE.exec(text);
    }
    const match = scheme && (!bare || scheme.index <= bare.index) ? scheme : bare;
    if (!match) return null;
    const raw = trimUrl(match[0]);
    const href = raw ? hrefFor(raw) : null;
    if (href) return { index: match.index, raw, href };
    start = match.index + Math.max(1, match[0].length);
  }
  return null;
}

/** Every link in the text, in order. */
export function findLinks(text: string): FoundLink[] {
  const links: FoundLink[] = [];
  for (let link = nextLink(text); link; link = nextLink(text, link.index + link.raw.length)) links.push(link);
  return links;
}

/** The YouTube video id in a link, if it is one. */
export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(u.pathname);
      id = m?.[1] ?? null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

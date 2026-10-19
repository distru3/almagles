import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import type { LookupFunction } from 'node:net';
import { findLinks, youtubeId } from './links.js';

/**
 * Link previews for post text: the title, description and image a page
 * advertises (Open Graph), or the thumbnail and title of a YouTube video.
 *
 * Fetched once, when a writer saves a post, and stored with it — readers never
 * trigger a fetch. Because the server is fetching addresses typed by a user,
 * every connection is pinned to a public IP checked at DNS-lookup time, so a
 * link can't make the server read its own network (SSRF).
 */

export interface LinkPreview {
  url: string;
  kind: 'youtube' | 'page';
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  youtubeId?: string;
}

/** Previews kept per post; later links stay clickable without a card. */
export const MAX_PREVIEWS = 4;
const TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 768 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'Mozilla/5.0 (compatible; RijalAlUmmahBot/1.0; link preview)';

/** Links in the order they appear, de-duplicated. */
export function extractUrls(text: string): string[] {
  return [...new Set(findLinks(text).map((l) => l.href))];
}

export { youtubeId };

// ── Address checks ────────────────────────────────────────────────────────

const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net4, prefix, 'ipv4');
for (const [net6, prefix] of [
  // (IPv4-mapped ::ffff:a.b.c.d is unwrapped and judged as IPv4 below; a ::ffff:0:0/96
  // rule here would also match every plain IPv4 address.)
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net6, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return false;
  // IPv4-mapped IPv6 (::ffff:10.0.0.1 or ::ffff:a00:1): judge the IPv4 part.
  const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (dotted) return !blocked.check(dotted[1], 'ipv4');
  const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return !blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, 'ipv4');
  }
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

class BlockedAddressError extends Error {}

/** DNS lookup that refuses private addresses; the socket connects to exactly what it returns. */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return (callback as any)(err);
    const list = (addresses as dns.LookupAddress[]).filter((a) => isPublicAddress(a.address));
    if (list.length === 0) return (callback as any)(new BlockedAddressError(`blocked address for ${hostname}`));
    if ((options as dns.LookupOptions).all) return (callback as any)(null, list);
    (callback as any)(null, list[0].address, list[0].family);
  });
};

// ── Fetching ──────────────────────────────────────────────────────────────

interface Fetched {
  url: string;
  body: Buffer;
  contentType: string;
}

function getOnce(url: URL, deadline: number): Promise<{ status: number; location?: string; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    if (url.port && url.port !== '80' && url.port !== '443') return reject(new Error('port not allowed'));
    // A literal IP in the URL skips DNS, so check it here.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && !isPublicAddress(host)) return reject(new BlockedAddressError('blocked address'));

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      {
        lookup: safeLookup,
        timeout: Math.max(1, deadline - Date.now()),
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'ar,en;q=0.8' },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType, body: Buffer.alloc(0) });
        }
        if (status !== 200 || !/text\/html|application\/xhtml|application\/json/i.test(contentType)) {
          res.resume();
          return resolve({ status, contentType, body: Buffer.alloc(0) });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          chunks.push(chunk);
          // The <head> is all we need; stop reading huge pages.
          if (size >= MAX_HTML_BYTES) res.destroy();
        });
        const done = () => resolve({ status, contentType, body: Buffer.concat(chunks).subarray(0, MAX_HTML_BYTES) });
        res.on('end', done);
        res.on('close', done);
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** GET with manual redirects, each hop re-checked. */
export async function safeFetch(rawUrl: string, timeoutMs = TIMEOUT_MS): Promise<Fetched | null> {
  const deadline = Date.now() + timeoutMs;
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    const res = await getOnce(url, deadline);
    if (res.location) {
      url = new URL(res.location, url);
      continue;
    }
    if (res.status !== 200 || res.body.length === 0) return null;
    return { url: url.toString(), body: res.body, contentType: res.contentType };
  }
  return null;
}

// ── Parsing ───────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function clean(s: string | undefined, max: number): string | null {
  if (!s) return null;
  const text = decodeEntities(s).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Decode with the page's declared charset (many Arabic sites still use windows-1256). */
function decodeHtml(body: Buffer, contentType: string): string {
  const head = body.subarray(0, 4096).toString('latin1');
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(charset.toLowerCase()).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

export function parsePreview(html: string, pageUrl: string): Omit<LinkPreview, 'url' | 'kind'> | null {
  const headEnd = html.search(/<\/head>|<body[\s>]/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 200_000);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = parseAttributes(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? '').toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];

  const title = clean(meta['og:title'] ?? meta['twitter:title'] ?? titleTag, 200);
  if (!title) return null;
  const description = clean(meta['og:description'] ?? meta['twitter:description'] ?? meta.description, 300);
  let image: string | null = null;
  const rawImage = meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['twitter:image'] ?? meta['twitter:image:src'];
  if (rawImage) {
    try {
      const u = new URL(decodeEntities(rawImage.trim()), pageUrl);
      // Only https images: http ones would be blocked as mixed content.
      if (u.protocol === 'https:') image = u.toString();
    } catch {
      /* ignore */
    }
  }
  const siteName = clean(meta['og:site_name'], 80) ?? new URL(pageUrl).hostname.replace(/^www\./, '');
  return { title, description, image, siteName };
}

async function youtubePreview(url: string, id: string): Promise<LinkPreview> {
  const base: LinkPreview = {
    url,
    kind: 'youtube',
    youtubeId: id,
    title: null,
    description: null,
    image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    siteName: 'YouTube',
  };
  try {
    const res = await safeFetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (res) {
      const data = JSON.parse(res.body.toString('utf8')) as { title?: string; author_name?: string };
      base.title = clean(data.title, 200);
      base.description = clean(data.author_name, 120);
    }
  } catch {
    /* thumbnail alone still makes a good card */
  }
  return base;
}

export async function fetchPreview(url: string): Promise<LinkPreview | null> {
  const id = youtubeId(url);
  if (id) return youtubePreview(url, id);
  try {
    const res = await safeFetch(url);
    if (!res || !/html/i.test(res.contentType)) return null;
    const parsed = parsePreview(decodeHtml(res.body, res.contentType), res.url);
    return parsed ? { url, kind: 'page', ...parsed } : null;
  } catch {
    return null;
  }
}

/**
 * Previews for the links in a post's text. Links whose preview is already in
 * `previous` are reused, so editing a post doesn't refetch everything.
 */
export async function previewsFor(text: string, previous: unknown): Promise<LinkPreview[]> {
  const urls = extractUrls(text).slice(0, MAX_PREVIEWS);
  const known = new Map<string, LinkPreview>();
  if (Array.isArray(previous)) {
    for (const p of previous as LinkPreview[]) if (p && typeof p.url === 'string') known.set(p.url, p);
  }
  const results = await Promise.all(urls.map((u) => known.get(u) ?? fetchPreview(u)));
  return results.filter((p): p is LinkPreview => p !== null);
}

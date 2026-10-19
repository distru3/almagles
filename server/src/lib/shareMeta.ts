import { prisma } from '../db.js';

/**
 * Link previews for OUR pages when they're shared (WhatsApp, Telegram, X,
 * Facebook…). Those apps don't run JavaScript, so the single-page app's
 * index.html is sent with the post's title, excerpt and image already in it.
 */

export const SITE_NAME = 'رجال الأمة';
const SITE_DESCRIPTION = 'رجال الأمة — جدول المقرر الأسبوعي والمنشورات اليومية';
const DEFAULT_IMAGE = { path: '/og-default.png', width: 1200, height: 630 };

export interface ShareMeta {
  title: string;
  description: string;
  /** Absolute URL, or a site path resolved against the request's origin. */
  image: string;
  imageWidth?: number;
  imageHeight?: number;
  imageAlt?: string;
  type: 'website' | 'article';
  publishedTime?: string;
  section?: string;
}

const DEFAULT_META: ShareMeta = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  image: DEFAULT_IMAGE.path,
  imageWidth: DEFAULT_IMAGE.width,
  imageHeight: DEFAULT_IMAGE.height,
  imageAlt: SITE_NAME,
  type: 'website',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** First ~200 characters of a post as one line: no links, no line breaks, cut at a word. */
export function excerpt(text: string, max = 200): string {
  const plain = text
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s،,.؛:]+$/, '')}…`;
}

/** A Cloudinary image cropped to the 1.91:1 card every app expects. */
function cloudinaryCard(url: string): string {
  return url.replace('/image/upload/', '/image/upload/c_fill,g_auto,w_1200,h_630,q_auto,f_jpg/');
}

interface PostForMeta {
  title: string;
  description: string;
  postDate: string;
  createdAt: Date;
  imageUrl: string | null;
  videoPosterUrl: string | null;
  linkPreviews: unknown;
  category: { name: string };
}

export function postMeta(post: PostForMeta): ShareMeta {
  const base = { title: post.title, description: excerpt(post.description) || SITE_DESCRIPTION, type: 'article' as const, publishedTime: post.createdAt.toISOString(), section: post.category.name, imageAlt: post.title };
  if (post.imageUrl?.includes('/image/upload/')) return { ...base, image: cloudinaryCard(post.imageUrl), imageWidth: 1200, imageHeight: 630 };
  if (post.imageUrl) return { ...base, image: post.imageUrl };
  if (post.videoPosterUrl) return { ...base, image: post.videoPosterUrl };
  const previews = Array.isArray(post.linkPreviews) ? (post.linkPreviews as { kind?: string; youtubeId?: string; image?: string | null }[]) : [];
  const yt = previews.find((p) => p?.kind === 'youtube' && p.youtubeId);
  if (yt) return { ...base, image: `https://i.ytimg.com/vi/${yt.youtubeId}/hqdefault.jpg`, imageWidth: 480, imageHeight: 360 };
  const page = previews.find((p) => p?.image);
  if (page?.image) return { ...base, image: page.image };
  return { ...base, image: DEFAULT_IMAGE.path, imageWidth: DEFAULT_IMAGE.width, imageHeight: DEFAULT_IMAGE.height, imageAlt: SITE_NAME };
}

/** Meta for a site path; unknown paths and missing posts get the site's own card. */
export async function metaForPath(pathname: string): Promise<ShareMeta> {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return DEFAULT_META;
  }
  const post = /^\/post\/([A-Za-z0-9_-]{1,40})\/?$/.exec(path);
  if (post) {
    const row = await prisma.post.findUnique({
      where: { id: post[1] },
      select: { title: true, description: true, postDate: true, createdAt: true, imageUrl: true, videoPosterUrl: true, linkPreviews: true, category: { select: { name: true } } },
    });
    return row ? postMeta(row) : DEFAULT_META;
  }
  const category = /^\/category\/([^/]{1,120})\/?$/.exec(path);
  if (category) {
    const row = await prisma.category.findUnique({ where: { slug: category[1] }, select: { name: true, _count: { select: { posts: true } } } });
    if (row) return { ...DEFAULT_META, title: `${row.name} — ${SITE_NAME}`, description: `منشورات قسم «${row.name}» على ${SITE_NAME} (${row._count.posts} منشوراً)` };
  }
  return DEFAULT_META;
}

/** index.html with this page's title, description and Open Graph / Twitter tags. */
export function renderShell(template: string, meta: ShareMeta, pageUrl: string, origin: string): string {
  const abs = (u: string) => (/^https?:\/\//.test(u) ? u : origin + u);
  const pageTitle = meta.title === SITE_NAME ? SITE_NAME : `${meta.title} — ${SITE_NAME}`;
  const tags: [string, string, string][] = [
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:locale', 'ar_AR'],
    ['property', 'og:type', meta.type],
    ['property', 'og:title', meta.title],
    ['property', 'og:description', meta.description],
    ['property', 'og:url', pageUrl],
    ['property', 'og:image', abs(meta.image)],
    ['property', 'og:image:alt', meta.imageAlt ?? meta.title],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', meta.title],
    ['name', 'twitter:description', meta.description],
    ['name', 'twitter:image', abs(meta.image)],
  ];
  if (meta.imageWidth && meta.imageHeight) {
    tags.push(['property', 'og:image:width', String(meta.imageWidth)], ['property', 'og:image:height', String(meta.imageHeight)]);
  }
  if (meta.publishedTime) tags.push(['property', 'article:published_time', meta.publishedTime]);
  if (meta.section) tags.push(['property', 'article:section', meta.section]);

  const head =
    tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`).join('\n    ') +
    `\n    <link rel="canonical" href="${escapeHtml(pageUrl)}" />`;

  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(pageTitle)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escapeHtml(meta.description)}" />`)
    .replace('</head>', `    ${head}\n  </head>`);
}

/**
 * Same-site path like `/post/abc`. `//host` and `/\host` start with a slash
 * but browsers resolve them to another site, so they don't count.
 */
export function isInternalPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
}

/** Internal paths pass through; anything else is forced to an http(s) URL. */
export function normalizeUrl(url: string | null | undefined): string {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return '';
  if (isInternalPath(trimmed) || /^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^[/\\]+/, '')}`;
}

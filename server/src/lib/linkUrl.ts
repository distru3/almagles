import { z } from 'zod';

/** `//host` and `/\host` start with a slash but resolve to another site. */
export function isInternalPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
}

/** A link field: blank → null, a bare domain gets https://, only http(s) or same-site paths. */
export const linkUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((val) => {
    if (!val) return null;
    if (isInternalPath(val) || /^https?:\/\//i.test(val)) return val;
    return `https://${val.replace(/^[/\\]+/, '')}`;
  })
  .refine(
    (val) => {
      if (!val || isInternalPath(val)) return true;
      try {
        const u = new URL(val);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'الرابط غير صالح' },
  );

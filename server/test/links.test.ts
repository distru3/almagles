import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findLinks, youtubeId } from '../src/lib/links.js';
import { extractUrls } from '../src/lib/linkPreview.js';
import { splitRich } from '../../client/src/lib/richText.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** What the browser makes clickable, as hrefs. */
const clientLinks = (text: string) => splitRich(text).parts.filter((p) => p.kind === 'link').map((p) => p.href);

const hrefs = (text: string) => findLinks(text).map((l) => l.href);
const raws = (text: string) => findLinks(text).map((l) => l.raw);

describe('link finding', () => {
  it('is one file shared verbatim by the client and the server', () => {
    const server = fs.readFileSync(path.join(here, '../src/lib/links.ts'), 'utf8');
    const client = fs.readFileSync(path.join(here, '../../client/src/lib/links.ts'), 'utf8');
    expect(client).toBe(server);
  });

  it('finds links written with a scheme, with www., or as a bare domain', () => {
    expect(hrefs('youtu.be/DICMiXT0i8w')).toEqual(['https://youtu.be/DICMiXT0i8w']);
    expect(hrefs('شاهد youtube.com/watch?v=DICMiXT0i8w الآن')).toEqual(['https://youtube.com/watch?v=DICMiXT0i8w']);
    expect(hrefs('المصدر: www.dorar.net/hadith/sharh/12')).toEqual(['https://www.dorar.net/hadith/sharh/12']);
    expect(hrefs('https://example.com/a')).toEqual(['https://example.com/a']);
    expect(hrefs('islamweb.net و alukah.net')).toEqual(['https://islamweb.net/', 'https://alukah.net/']);
    expect(hrefs('https://ar.wikipedia.org/wiki/مكة')).toHaveLength(1);
  });

  it('leaves out sentence punctuation and keeps brackets that belong to the link', () => {
    expect(raws('انظر youtu.be/DICMiXT0i8w، ثم (example.com/a).')).toEqual(['youtu.be/DICMiXT0i8w', 'example.com/a']);
    expect(raws('https://en.wikipedia.org/wiki/Mecca_(city) هنا')).toEqual(['https://en.wikipedia.org/wiki/Mecca_(city)']);
    expect(raws('youtube.com؟')).toEqual(['youtube.com']);
  });

  it('does not turn emails, file names, numbers or prose into links', () => {
    for (const text of ['راسلنا على info@example.com', 'ملف node.js', 'القيمة 3.14', 'ASP.NET و Example.Com', 'e.g. مثلاً', 'javascript:alert(1)', 'a.b']) {
      expect(hrefs(text), text).toEqual([]);
    }
  });

  it('the browser and the server find exactly the same links', () => {
    const corpus = [
      'قال تعالى ﴿إن الله﴾ youtu.be/DICMiXT0i8w ((حديث)) www.dorar.net/x، https://example.com/a?b=1',
      'روابط: islamweb.net/ar/fatwa/1 و bit.ly/abc و info@example.com و 3.14',
      'سطر\nhttps://youtu.be/DICMiXT0i8w?si=abc\nسطر youtube.com/shorts/DICMiXT0i8w',
    ];
    for (const text of corpus) {
      expect(clientLinks(text), text).toEqual(findLinks(text).map((l) => l.href));
      expect(extractUrls(text), text).toEqual([...new Set(clientLinks(text))]);
    }
  });

  it('recognises YouTube links in every common form, bare or not', () => {
    for (const u of ['youtu.be/DICMiXT0i8w', 'youtube.com/watch?v=DICMiXT0i8w', 'https://m.youtube.com/shorts/DICMiXT0i8w', 'www.youtube.com/live/DICMiXT0i8w?si=x']) {
      expect(youtubeId(findLinks(u)[0].href), u).toBe('DICMiXT0i8w');
    }
  });
});

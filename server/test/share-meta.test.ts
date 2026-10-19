import { describe, expect, it } from 'vitest';
import { excerpt, postMeta } from '../src/lib/shareMeta.js';

const base = {
  title: 'قصة فلسطين',
  postDate: '2026-10-19',
  createdAt: new Date('2026-10-19T19:50:58Z'),
  imageUrl: null,
  videoPosterUrl: null,
  category: { name: 'معلومة تاريخية' },
};

describe('share preview text', () => {
  it("uses the post's own words, without links", () => {
    expect(postMeta({ ...base, description: 'نص المنشور https://youtu.be/x', linkPreviews: null }).description).toBe('نص المنشور');
  });

  it('describes a link-only post by what it links to, never the long site tagline', () => {
    const yt = [{ kind: 'youtube', youtubeId: 'lZvxulNQYt4', title: 'تاريخ فلسطين حتى الآن', image: null }];
    const m = postMeta({ ...base, description: 'youtu.be/lZvxulNQYt4', linkPreviews: yt });
    expect(m.description).toBe('فيديو: تاريخ فلسطين حتى الآن');
    expect(m.image).toBe('https://i.ytimg.com/vi/lZvxulNQYt4/hqdefault.jpg');
    expect(postMeta({ ...base, description: 'https://example.com/a', linkPreviews: [{ kind: 'page', title: 'مقالة', image: null }] }).description).toBe('مقالة');
    expect(postMeta({ ...base, description: 'example.com', linkPreviews: [] }).description).toBe('معلومة تاريخية · رجال الأمة');
  });

  it('cuts long text at a word with an ellipsis', () => {
    const e = excerpt('كلمة '.repeat(100));
    expect(e.endsWith('…')).toBe(true);
    expect(e.length).toBeLessThanOrEqual(201);
    expect(e).not.toMatch(/كلم…$/);
  });
});

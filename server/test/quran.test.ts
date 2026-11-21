import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { client, createUser, loginAs, prisma, resetDb } from './helpers.js';
import { isAyah, pageOf } from '../src/lib/quran.js';
import { PAGE_STARTS, SURA_AYAS } from '../src/lib/quranMeta.js';
import { MAX_CUSTOM_MARKS } from '../src/routes/quran.js';

beforeEach(resetDb);

const master = (name: string) => readFileSync(new URL(`../../client/quran/${name}`, import.meta.url));

describe('the mushaf’s source', () => {
  it('is Tanzil’s text and metadata exactly as downloaded', () => {
    const sha = (name: string) => createHash('sha256').update(master(name)).digest('hex');
    expect(sha('quran-uthmani.txt')).toBe('7f30c647331a61100ebf24a80507dc0fcdd9f2df97f1312b5b2dfcb982a7f326');
    expect(sha('quran-data.xml')).toBe('8867c1d88191472adec9db694b3cd9f135b1a2ef580574d32cf888dcb22c5c7a');
  });

  it('agrees with the generated table of surahs and pages', () => {
    const xml = master('quran-data.xml').toString('utf8');
    const ayas = [...xml.matchAll(/<sura index="\d+" ayas="(\d+)"/g)].map((m) => Number(m[1]));
    const pages = [...xml.matchAll(/<page index="\d+" sura="(\d+)" aya="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(SURA_AYAS).toEqual(ayas);
    expect(PAGE_STARTS).toEqual(pages);
    expect(SURA_AYAS.reduce((n, a) => n + a, 0)).toBe(6236);
  });

  it('finds the page of an ayah as in the Madinah mushaf', () => {
    expect(pageOf(1, 1)).toBe(1);
    expect(pageOf(2, 1)).toBe(2);
    expect(pageOf(18, 1)).toBe(293);
    expect(pageOf(67, 1)).toBe(562);
    expect(pageOf(78, 1)).toBe(582);
    expect(pageOf(114, 6)).toBe(604);
    expect(isAyah(2, 286)).toBe(true);
    expect(isAyah(2, 287)).toBe(false);
    expect(isAyah(115, 1)).toBe(false);
  });
});

async function member(email = 'a@test.local') {
  await createUser({ email });
  return loginAs(email);
}

describe('«علاماتي»', () => {
  it('needs a signed-in member', async () => {
    expect((await (await client()).get('/api/quran/bookmarks')).status).toBe(401);
  });

  it('keeps one «تلاوة» mark and moves it forward, working out its page', async () => {
    const c = await member();
    const first = await c.put('/api/quran/bookmarks/tilawa', { sura: 18, aya: 1 });
    expect(first.status).toBe(200);
    expect(first.body.mark).toMatchObject({ kind: 'tilawa', sura: 18, aya: 1, page: 293, label: null });
    await c.put('/api/quran/bookmarks/tilawa', { sura: 18, aya: 75 });
    await c.put('/api/quran/bookmarks/hifz', { sura: 78, aya: 1 });
    const { marks } = (await c.get('/api/quran/bookmarks')).body;
    expect(marks).toHaveLength(2);
    expect(marks.find((m: { kind: string }) => m.kind === 'tilawa')).toMatchObject({ sura: 18, aya: 75 });
    expect(marks.find((m: { kind: string }) => m.kind === 'hifz')).toMatchObject({ page: 582 });
  });

  it('refuses an ayah that doesn’t exist or an unknown kind', async () => {
    const c = await member();
    expect((await c.put('/api/quran/bookmarks/tilawa', { sura: 2, aya: 287 })).status).toBe(400);
    expect((await c.put('/api/quran/bookmarks/tilawa', { sura: 0, aya: 1 })).status).toBe(400);
    expect((await c.put('/api/quran/bookmarks/custom', { sura: 1, aya: 1 })).status).toBe(404);
    expect((await c.put('/api/quran/bookmarks/reading', { sura: 1, aya: 1 })).status).toBe(404);
  });

  it('lets a member name their own marks, rename, move and delete them', async () => {
    const c = await member();
    const made = await c.post('/api/quran/bookmarks', { label: 'ورد الفجر', sura: 36, aya: 1 });
    expect(made.status).toBe(201);
    expect(made.body.mark).toMatchObject({ kind: 'custom', label: 'ورد الفجر', page: 440 });
    const id = made.body.mark.id;
    expect((await c.post('/api/quran/bookmarks', { label: '  ', sura: 36, aya: 1 })).status).toBe(400);

    const moved = await c.patch(`/api/quran/bookmarks/custom/${id}`, { label: 'ورد المساء', sura: 67, aya: 1 });
    expect(moved.body.mark).toMatchObject({ label: 'ورد المساء', page: 562 });
    expect((await c.patch(`/api/quran/bookmarks/custom/${id}`, { sura: 67 })).status).toBe(400);

    expect((await c.del(`/api/quran/bookmarks/${id}`)).status).toBe(200);
    expect((await c.get('/api/quran/bookmarks')).body.marks).toEqual([]);
  });

  it('caps a member’s own marks', async () => {
    const c = await member();
    const me = await prisma.user.findUniqueOrThrow({ where: { email: 'a@test.local' } });
    await prisma.quranBookmark.createMany({
      data: Array.from({ length: MAX_CUSTOM_MARKS }, (_, i) => ({ userId: me.id, kind: 'custom' as const, slot: `custom:${i}`, label: `${i}`, sura: 1, aya: 1, page: 1 })),
    });
    expect((await c.post('/api/quran/bookmarks', { label: 'أخرى', sura: 1, aya: 1 })).status).toBe(400);
  });

  it('never shows or touches another member’s marks', async () => {
    const a = await member('a@test.local');
    const b = await member('b@test.local');
    const mine = (await a.post('/api/quran/bookmarks', { label: 'لي', sura: 1, aya: 1 })).body.mark;
    expect((await b.get('/api/quran/bookmarks')).body.marks).toEqual([]);
    expect((await b.del(`/api/quran/bookmarks/${mine.id}`)).status).toBe(404);
    expect((await b.patch(`/api/quran/bookmarks/custom/${mine.id}`, { label: 'سرقة' })).status).toBe(404);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';

beforeEach(resetDb);

async function admin() {
  await createUser({ email: 'admin@test.local', role: 'admin' });
  return loginAs('admin@test.local');
}

describe('sessions', () => {
  it('derives the weekday from the date and ignores a mismatched one', async () => {
    const a = await admin();
    const res = await a.post('/api/schedule', { date: '2026-10-14', title: 'درس', weekdayKey: 'fri' });
    expect(res.status).toBe(201);
    expect(res.body.item.weekdayKey).toBe('wed');
  });

  it('rejects impossible calendar dates', async () => {
    const a = await admin();
    expect((await a.post('/api/schedule', { date: '2026-02-30', title: 'درس' })).status).toBe(400);
    expect((await a.post('/api/schedule', { date: '2026-13-01', title: 'درس' })).status).toBe(400);
  });

  it('normalizes links and rejects other-site paths that look internal', async () => {
    const a = await admin();
    const ok = await a.post('/api/schedule', { date: '2026-10-14', title: 'درس', linkUrl: 'youtu.be/abc', linkLabel: 'المحاضرة' });
    expect(ok.body.item).toMatchObject({ linkUrl: 'https://youtu.be/abc', linkLabel: 'المحاضرة' });
    const sneaky = await a.post('/api/schedule', { date: '2026-10-14', title: 'درس', linkUrl: '//evil.example' });
    expect(sneaky.body.item.linkUrl).toBe('https://evil.example'); // treated as external, never as same-site
    expect((await a.post('/api/schedule', { date: '2026-10-14', title: 'درس', linkUrl: 'javascript:alert(1)' })).status).toBe(400);
  });

  it('appends within a day and recomputes the weekday when moved', async () => {
    const a = await admin();
    const first = (await a.post('/api/schedule', { date: '2026-10-14', title: 'أ' })).body.item;
    const second = (await a.post('/api/schedule', { date: '2026-10-14', title: 'ب' })).body.item;
    expect(second.sortOrder).toBe(first.sortOrder + 1);
    const moved = (await a.put(`/api/schedule/${second.id}`, { date: '2026-10-15' })).body.item;
    expect(moved.weekdayKey).toBe('thu');
  });
});

describe('weeks', () => {
  it('copies the closest earlier week onto the target week, without notes', async () => {
    const a = await admin();
    await a.post('/api/schedule/bulk', {
      items: [
        { date: '2026-10-10', title: 'السبت', notes: 'ملاحظة خاصة باليوم' },
        { date: '2026-10-12', title: 'الاثنين', timeLabel: 'فجر' },
      ],
    });
    const res = await a.post('/api/schedule/copy-week', { to: '2026-10-19' }); // any day in the target week
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ from: '2026-10-10', to: '2026-10-17' });
    expect(res.body.items.map((i: { date: string }) => i.date).sort()).toEqual(['2026-10-17', '2026-10-19']);
    expect(res.body.items.every((i: { notes: string | null }) => i.notes === null)).toBe(true);
  });

  it('reports when there is no earlier week to copy', async () => {
    const a = await admin();
    expect((await a.post('/api/schedule/copy-week', { to: '2026-10-17' })).status).toBe(404);
  });

  it('deletes a whole week given any date inside it', async () => {
    const a = await admin();
    await a.post('/api/schedule/bulk', {
      items: [{ date: '2026-10-17', title: 'أ' }, { date: '2026-10-23', title: 'ب' }, { date: '2026-10-24', title: 'الأسبوع التالي' }],
    });
    const res = await a.del('/api/schedule/week/2026-10-20');
    expect(res.body.deleted).toBe(2);
    expect(await prisma.scheduleItem.count()).toBe(1);
  });
});

describe('custom columns', () => {
  it('stores values per column and strips them when the column is deleted', async () => {
    const a = await admin();
    const shaykh = (await a.post('/api/schedule/columns', { label: 'الشيخ' })).body.column;
    const amount = (await a.post('/api/schedule/columns', { label: 'الكمية' })).body.column;
    const item = (
      await a.post('/api/schedule', {
        date: '2026-10-14',
        title: 'درس',
        customValues: { [shaykh.id]: 'الشيخ أ', [amount.id]: '' },
      })
    ).body.item;
    expect(item.customValues).toEqual({ [shaykh.id]: 'الشيخ أ' }); // empty values dropped

    await a.put(`/api/schedule/${item.id}`, { customValues: { [shaykh.id]: 'الشيخ أ', [amount.id]: 'نصف محاضرة' } });
    expect((await a.del(`/api/schedule/columns/${amount.id}`)).status).toBe(200);
    const after = await prisma.scheduleItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.customValues).toEqual({ [shaykh.id]: 'الشيخ أ' });
  });
});

describe('«ملاحظات المجلس»', () => {
  it('keeps one note per day, records the last editor, and deletes on empty', async () => {
    const a = await admin();
    await a.put('/api/schedule/notes/2026-10-14', { content: '  أولى  ' });
    const second = await a.put('/api/schedule/notes/2026-10-14', { content: 'معدّلة' });
    expect(second.body.note).toMatchObject({ content: 'معدّلة', updatedByName: expect.any(String) });
    expect(await prisma.councilNote.count()).toBe(1);

    await a.put('/api/schedule/notes/2026-10-14', { content: '   ' });
    expect(await prisma.councilNote.count()).toBe(0);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { periodOf } from '../src/routes/tasks.js';

beforeEach(resetDb);

const today = () => new Date().toISOString().slice(0, 10);
const daysFromToday = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function manager() {
  await createUser({ email: 'm@test.local', canManageSchedule: true });
  return loginAs('m@test.local');
}
async function member(email = 'v@test.local', name?: string) {
  await createUser({ email, name });
  return loginAs(email);
}

describe('periods', () => {
  it('uses the day, the Saturday of the week, or once', () => {
    expect(periodOf('daily', '2026-11-18')).toBe('2026-11-18');
    expect(periodOf('weekly', '2026-11-18')).toBe('2026-11-14'); // Wednesday → that week's Saturday
    expect(periodOf('weekly', '2026-11-14')).toBe('2026-11-14'); // Saturday is its own start
    expect(periodOf('weekly', '2026-11-20')).toBe('2026-11-14'); // Friday ends the week
    expect(periodOf('once', '2026-11-18')).toBe('once');
  });
});

describe('managing tasks', () => {
  it('lets admins and schedule managers write tasks, not other members', async () => {
    const m = await manager();
    const created = await m.post('/api/tasks', { title: 'حفظ آيات من الأنعام', repeat: 'weekly', linkUrl: 'quran.com/6' });
    expect(created.status).toBe(201);
    expect(created.body.task).toMatchObject({ title: 'حفظ آيات من الأنعام', repeat: 'weekly', linkUrl: 'https://quran.com/6', active: true });

    await createUser({ email: 'a@test.local', role: 'admin' });
    const a = await loginAs('a@test.local');
    expect((await a.post('/api/tasks', { title: 'قيام الليل', repeat: 'daily' })).status).toBe(201);

    await createUser({ email: 'w@test.local', role: 'writer' });
    const w = await loginAs('w@test.local');
    expect((await w.post('/api/tasks', { title: 'x', repeat: 'daily' })).status).toBe(403);
    expect((await w.get('/api/tasks/progress?date=2026-11-14')).status).toBe(403);
  });

  it('validates the title and repeat', async () => {
    const m = await manager();
    expect((await m.post('/api/tasks', { title: '  ', repeat: 'daily' })).status).toBe(400);
    expect((await m.post('/api/tasks', { title: 'مهمة', repeat: 'monthly' })).status).toBe(400);
  });

  it('archives a task out of members’ lists and deletes it with its history', async () => {
    const m = await manager();
    const v = await member();
    const task = (await m.post('/api/tasks', { title: 'قيام الليل', repeat: 'daily' })).body.task;
    await v.put(`/api/tasks/${task.id}/done`, { date: today(), done: true });

    await m.put(`/api/tasks/${task.id}`, { active: false });
    expect((await v.get(`/api/tasks?date=${today()}`)).body.tasks).toHaveLength(0);
    expect((await m.get('/api/tasks/manage')).body.tasks).toHaveLength(1);
    expect((await v.put(`/api/tasks/${task.id}/done`, { date: today(), done: true })).status).toBe(404);

    expect((await m.del(`/api/tasks/${task.id}`)).status).toBe(200);
    expect(await prisma.taskCompletion.count()).toBe(0);
  });
});

describe('ticking tasks', () => {
  it('keeps each member’s checkmarks their own, and ticking twice is harmless', async () => {
    const m = await manager();
    const task = (await m.post('/api/tasks', { title: 'قيام الليل', repeat: 'daily' })).body.task;
    const v = await member('v@test.local');
    const u = await member('u@test.local');

    const url = `/api/tasks/${task.id}/done`;
    const results = await Promise.all([v.put(url, { date: today(), done: true }), v.put(url, { date: today(), done: true })]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await prisma.taskCompletion.count()).toBe(1);

    expect((await v.get(`/api/tasks?date=${today()}`)).body.tasks[0].done).toBe(true);
    expect((await u.get(`/api/tasks?date=${today()}`)).body.tasks[0].done).toBe(false);

    await v.put(url, { date: today(), done: false });
    expect((await v.get(`/api/tasks?date=${today()}`)).body.tasks[0].done).toBe(false);
  });

  it('resets daily tasks each day and weekly tasks each week; one-time tasks stay done', async () => {
    const m = await manager();
    const v = await member();
    const make = async (repeat: string) => (await m.post('/api/tasks', { title: repeat, repeat })).body.task;
    const [daily, weekly, once] = [await make('daily'), await make('weekly'), await make('once')];
    for (const t of [daily, weekly, once]) await v.put(`/api/tasks/${t.id}/done`, { date: today(), done: true });

    const doneOn = async (date: string) =>
      Object.fromEntries((await v.get(`/api/tasks?date=${date}`)).body.tasks.map((t: { repeat: string; done: boolean }) => [t.repeat, t.done]));
    expect(await doneOn(today())).toEqual({ daily: true, weekly: true, once: true });
    expect(await doneOn(daysFromToday(1))).toMatchObject({ daily: false, once: true });
    expect(await doneOn(daysFromToday(7))).toEqual({ daily: false, weekly: false, once: true });
  });

  it('refuses ticking days far from today', async () => {
    const m = await manager();
    const v = await member();
    const task = (await m.post('/api/tasks', { title: 'قيام الليل', repeat: 'daily' })).body.task;
    expect((await v.put(`/api/tasks/${task.id}/done`, { date: daysFromToday(-5), done: true })).status).toBe(400);
    expect((await v.put(`/api/tasks/${task.id}/done`, { date: daysFromToday(1), done: true })).status).toBe(200); // ahead of UTC
  });

  it('requires login', async () => {
    const v = await member();
    await v.post('/api/auth/logout');
    expect((await v.get(`/api/tasks?date=${today()}`)).status).toBe(401);
  });
});

describe('progress', () => {
  it('shows managers who did which task this period', async () => {
    const m = await manager();
    const t1 = (await m.post('/api/tasks', { title: 'حفظ', repeat: 'weekly' })).body.task;
    const t2 = (await m.post('/api/tasks', { title: 'قيام الليل', repeat: 'daily' })).body.task;
    const v = await member('v@test.local', 'أحمد');
    await member('u@test.local', 'بلال');
    await v.put(`/api/tasks/${t1.id}/done`, { date: today(), done: true });

    const res = await m.get(`/api/tasks/progress?date=${today()}`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: { id: string; doneCount: number }) => [t.id, t.doneCount])).toEqual([
      [t1.id, 1],
      [t2.id, 0],
    ]);
    const byName = Object.fromEntries(res.body.members.map((x: { name: string; done: string[] }) => [x.name, x.done]));
    expect(byName['أحمد']).toEqual([t1.id]);
    expect(byName['بلال']).toEqual([]);
  });
});

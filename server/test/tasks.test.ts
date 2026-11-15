import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { periodOf } from '../src/routes/tasks.js';
import { appliesOn, effectiveDay, nightCutoff, notOpenYet, type TaskSchedule } from '../src/lib/taskSchedule.js';

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

const sched = (over: Partial<TaskSchedule>): TaskSchedule => ({
  repeat: 'daily',
  startDate: null,
  endDate: null,
  weekdays: [],
  timeWindow: 'anytime',
  startTime: null,
  endTime: null,
  ...over,
});

describe('schedules', () => {
  it('counts a night task ticked after midnight for the evening before', () => {
    const qiyam = sched({ timeWindow: 'qiyam' });
    expect(effectiveDay(qiyam, '2026-11-16', '02:10')).toBe('2026-11-15');
    expect(effectiveDay(qiyam, '2026-11-16', '08:30')).toBe('2026-11-15'); // ticked after waking up
    expect(effectiveDay(qiyam, '2026-11-15', '21:00')).toBe('2026-11-15');
    expect(effectiveDay(sched({}), '2026-11-16', '02:10')).toBe('2026-11-16');

    const late = sched({ timeWindow: 'range', startTime: '21:00', endTime: '05:00' });
    expect(nightCutoff(late)).toBe('13:00');
    expect(effectiveDay(late, '2026-11-16', '04:59')).toBe('2026-11-15');
    expect(notOpenYet(late, '16:00')).toBe(true);
    expect(notOpenYet(late, '22:00')).toBe(false);
    expect(notOpenYet(late, '09:00')).toBe(false); // still last night's

    const morning = sched({ timeWindow: 'range', startTime: '05:00', endTime: '09:00' });
    expect(notOpenYet(morning, '04:30')).toBe(true);
    expect(notOpenYet(morning, '10:00')).toBe(false);
  });

  it('applies within its dates and on its weekdays', () => {
    const fast = sched({ weekdays: [1, 4] }); // Monday and Thursday
    expect(appliesOn(fast, '2026-11-16')).toBe(true); // Monday
    expect(appliesOn(fast, '2026-11-17')).toBe(false);
    const ranged = sched({ startDate: '2026-11-20', endDate: '2026-11-22' });
    expect(appliesOn(ranged, '2026-11-19')).toBe(false);
    expect(appliesOn(ranged, '2026-11-22')).toBe(true);
    expect(appliesOn(ranged, '2026-11-23')).toBe(false);
    // A weekly task shows for any week overlapping its dates.
    expect(appliesOn(sched({ repeat: 'weekly', startDate: '2026-11-20' }), '2026-11-14')).toBe(true);
    expect(appliesOn(sched({ repeat: 'weekly', startDate: '2026-11-21' }), '2026-11-20')).toBe(false);
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

  it('validates and tidies the schedule', async () => {
    const m = await manager();
    const bad = (body: object) => m.post('/api/tasks', { title: 'مهمة', repeat: 'daily', ...body });
    expect((await bad({ startDate: '2026-11-20', endDate: '2026-11-19' })).status).toBe(400);
    expect((await bad({ timeWindow: 'range', startTime: '05:00' })).status).toBe(400);
    expect((await bad({ timeWindow: 'range', startTime: '25:00', endTime: '06:00' })).status).toBe(400);
    expect((await bad({ points: 0 })).status).toBe(400);

    const weekly = await m.post('/api/tasks', { title: 'حفظ', repeat: 'weekly', weekdays: [1], timeWindow: 'qiyam', startTime: '01:00', endTime: '02:00' });
    expect(weekly.body.task).toMatchObject({ weekdays: [], startTime: null, endTime: null, points: 10 });

    const fast = await m.post('/api/tasks', { title: 'صيام', repeat: 'daily', weekdays: [4, 1, 1], points: 30 });
    expect(fast.body.task).toMatchObject({ weekdays: [1, 4], points: 30 });
    // An update is checked against the task as it will be saved.
    expect((await m.put(`/api/tasks/${fast.body.task.id}`, { endDate: '2020-01-01', startDate: '2021-01-01' })).status).toBe(400);
    expect((await m.put(`/api/tasks/${fast.body.task.id}`, { timeWindow: 'range' })).status).toBe(400);
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

  it('counts qiyam ticked after midnight for the night before', async () => {
    const m = await manager();
    const v = await member();
    const task = (await m.post('/api/tasks', { title: 'قيام الليل', repeat: 'daily', timeWindow: 'qiyam' })).body.task;
    const res = await v.put(`/api/tasks/${task.id}/done`, { date: today(), time: '02:30', done: true });
    expect(res.status).toBe(200);
    expect(res.body.day).toBe(daysFromToday(-1));
    // Still ticked when looked at after waking up; tonight is a fresh night.
    expect((await v.get(`/api/tasks?date=${today()}&time=08:00`)).body.tasks[0].done).toBe(true);
    expect((await v.get(`/api/tasks?date=${today()}&time=20:00`)).body.tasks[0].done).toBe(false);
  });

  it('hides tasks outside their days, and refuses ticks before their time', async () => {
    const m = await manager();
    const v = await member();
    const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
    const elsewhere = (await m.post('/api/tasks', { title: 'صيام', repeat: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== dow(today())) })).body.task;
    await m.post('/api/tasks', { title: 'صيام الغد', repeat: 'daily', weekdays: [dow(daysFromToday(1))] });
    const morning = (await m.post('/api/tasks', { title: 'أذكار الصباح', repeat: 'daily', timeWindow: 'range', startTime: '05:00', endTime: '09:00' })).body.task;

    const list = (await v.get(`/api/tasks?date=${today()}&time=10:00`)).body;
    const titles = list.tasks.map((t: { title: string }) => t.title);
    expect(titles).toContain('أذكار الصباح');
    expect(titles).not.toContain('صيام');
    expect(titles).not.toContain('صيام الغد');
    expect(list.tomorrow.map((t: { title: string }) => t.title)).toEqual(['صيام', 'صيام الغد']);

    expect((await v.put(`/api/tasks/${elsewhere.id}/done`, { date: today(), done: true })).status).toBe(400);
    expect((await v.put(`/api/tasks/${morning.id}/done`, { date: today(), time: '04:00', done: true })).status).toBe(400);
    expect((await v.put(`/api/tasks/${morning.id}/done`, { date: today(), time: '10:30', done: true })).status).toBe(200);
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

describe('board', () => {
  it('shows every member the points, streaks and recent ticks of those taking part', async () => {
    const m = await manager();
    const qiyam = (await m.post('/api/tasks', { title: 'قيام الليل', repeat: 'daily', timeWindow: 'qiyam', points: 20 })).body.task;
    const quran = (await m.post('/api/tasks', { title: 'ورد القرآن', repeat: 'daily' })).body.task;
    const v = await member('v@test.local', 'أحمد');
    const u = await member('u@test.local', 'بلال');
    await member('x@test.local', 'خالد'); // never ticked: not listed

    await v.put(`/api/tasks/${quran.id}/done`, { date: today(), time: '15:00', done: true });
    await v.put(`/api/tasks/${qiyam.id}/done`, { date: today(), time: '22:00', done: true });
    await u.put(`/api/tasks/${quran.id}/done`, { date: today(), time: '16:00', done: true });
    const ahmad = (await prisma.user.findUnique({ where: { email: 'v@test.local' } }))!;
    // Two earlier days of history make a three-day streak.
    await prisma.taskCompletion.createMany({
      data: [1, 2].map((n) => ({ taskId: quran.id, userId: ahmad.id, period: daysFromToday(-n), day: daysFromToday(-n), points: 10, createdAt: new Date(Date.now() - n * 86_400_000) })),
    });

    const res = await u.get(`/api/tasks/board?date=${today()}`);
    expect(res.status).toBe(200);
    expect(res.body.members.map((x: { name: string }) => x.name)).toEqual(['أحمد', 'بلال']);
    expect(res.body.members[0]).toMatchObject({ total: 50, today: 2, streak: 3, bestStreak: 3 });
    expect(res.body.members[1]).toMatchObject({ total: 10, today: 1, streak: 1 });
    expect(res.body.first.name).toBe('أحمد');
    expect(res.body.recent[0]).toMatchObject({ name: 'بلال', title: 'ورد القرآن', points: 10 });

    // The checklist says how many members did each task.
    const list = (await u.get(`/api/tasks?date=${today()}&time=16:30`)).body.tasks;
    expect(list.find((t: { id: string }) => t.id === quran.id).doneCount).toBe(2);
  });

  it('awards badges', async () => {
    const m = await manager();
    const qiyam = (await m.post('/api/tasks', { title: 'قيام الليل', repeat: 'daily', timeWindow: 'qiyam' })).body.task;
    const v = await member('v@test.local', 'أحمد');
    const ahmad = (await prisma.user.findUnique({ where: { email: 'v@test.local' } }))!;
    await prisma.taskCompletion.createMany({
      data: Array.from({ length: 8 }, (_, n) => ({ taskId: qiyam.id, userId: ahmad.id, period: daysFromToday(-n - 20), day: daysFromToday(-n - 20) })),
    });
    const me = (await v.get(`/api/tasks/board?date=${today()}`)).body.members[0];
    expect(me).toMatchObject({ streak: 0, bestStreak: 8, nights: 8 });
    expect(me.badges).toEqual(['steady', 'qawwam']);
  });
});

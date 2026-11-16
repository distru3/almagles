import { beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { periodOf } from '../src/routes/tasks.js';
import { DEFAULT_PRAYERS, appliesOn, effectiveDay, nightCutoff, notOpenYet, prayerClock, type TaskSchedule } from '../src/lib/taskSchedule.js';

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
  it('runs qiyam from Isha to Fajr where the member is, then switches to tonight', () => {
    const qiyam = sched({ timeWindow: 'qiyam' });
    const cairo = prayerClock('04:50', '18:19');
    expect(effectiveDay(qiyam, '2026-11-16', '02:10', cairo)).toBe('2026-11-15'); // after midnight: last night
    expect(effectiveDay(qiyam, '2026-11-16', '04:49', cairo)).toBe('2026-11-15');
    expect(effectiveDay(qiyam, '2026-11-16', '04:50', cairo)).toBe('2026-11-16'); // Fajr: the night is over
    expect(effectiveDay(qiyam, '2026-11-16', '08:30', cairo)).toBe('2026-11-16'); // morning: tonight's, not ticked yet
    expect(notOpenYet(qiyam, '08:30', cairo)).toBe(true);
    expect(notOpenYet(qiyam, '18:18', cairo)).toBe(true);
    expect(notOpenYet(qiyam, '18:19', cairo)).toBe(false); // Isha
    expect(notOpenYet(qiyam, '02:10', cairo)).toBe(false);

    // Casablanca's Fajr is later (Morocco keeps UTC+1): 06:00 there is still the night.
    const casablanca = prayerClock('06:31', '19:49');
    expect(effectiveDay(qiyam, '2026-11-16', '06:00', casablanca)).toBe('2026-11-15');
    expect(notOpenYet(qiyam, '19:00', casablanca)).toBe(true);

    expect(effectiveDay(sched({}), '2026-11-16', '02:10')).toBe('2026-11-16');
  });

  it('ignores implausible prayer times from the browser', () => {
    expect(prayerClock('13:00', '03:00')).toEqual(DEFAULT_PRAYERS);
    expect(prayerClock(undefined, 'nope')).toEqual(DEFAULT_PRAYERS);
    expect(prayerClock('04:12', '20:45')).toEqual({ fajr: '04:12', isha: '20:45' });
  });

  it('ends a fixed night range at its end time', () => {
    const late = sched({ timeWindow: 'range', startTime: '21:00', endTime: '05:00' });
    expect(nightCutoff(late)).toBe('05:00');
    expect(effectiveDay(late, '2026-11-16', '04:59')).toBe('2026-11-15');
    expect(effectiveDay(late, '2026-11-16', '09:00')).toBe('2026-11-16');
    expect(notOpenYet(late, '16:00')).toBe(true);
    expect(notOpenYet(late, '09:00')).toBe(true);
    expect(notOpenYet(late, '22:00')).toBe(false);
    expect(notOpenYet(late, '03:00')).toBe(false);

    const morning = sched({ timeWindow: 'range', startTime: '05:00', endTime: '09:00' });
    expect(notOpenYet(morning, '04:30')).toBe(true);
    expect(notOpenYet(morning, '10:00')).toBe(false); // did it on time, ticks it later
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

  it('counts qiyam ticked after midnight for the night before, and starts fresh after Fajr', async () => {
    const m = await manager();
    const v = await member();
    const task = (await m.post('/api/tasks', { title: 'قيام الليل', repeat: 'daily', timeWindow: 'qiyam' })).body.task;
    const cairo = { fajr: '04:50', isha: '18:19' };
    const res = await v.put(`/api/tasks/${task.id}/done`, { date: today(), time: '02:30', done: true, ...cairo });
    expect(res.status).toBe(200);
    expect(res.body.day).toBe(daysFromToday(-1));
    const at = async (time: string) => (await v.get(`/api/tasks?date=${today()}&time=${time}&fajr=04:50&isha=18:19`)).body.tasks[0];
    // Still last night's until Fajr…
    expect(await at('04:00')).toMatchObject({ done: true, day: daysFromToday(-1) });
    // …then tonight's, unticked — not «already done» in the morning.
    expect(await at('08:00')).toMatchObject({ done: false, day: today() });
    expect(await at('20:00')).toMatchObject({ done: false, day: today() });
  });

  it('refuses qiyam outside Isha to Fajr, and offers a missed night to make up', async () => {
    const m = await manager();
    const v = await member();
    const task = (await m.post('/api/tasks', { title: 'قيام الليل', repeat: 'daily', timeWindow: 'qiyam' })).body.task;
    await prisma.task.update({ where: { id: task.id }, data: { createdAt: new Date(Date.now() - 3 * 86_400_000) } });
    await prisma.user.update({ where: { email: 'v@test.local' }, data: { createdAt: new Date(Date.now() - 3 * 86_400_000) } });
    const cairo = { fajr: '04:50', isha: '18:19' };
    const tick = (time: string) => v.put(`/api/tasks/${task.id}/done`, { date: today(), time, done: true, ...cairo });
    const morning = await tick('08:00');
    expect(morning.status).toBe(400);
    expect(morning.body.message).toContain('تدارك ما فاتك');
    expect((await tick('17:00')).status).toBe(400);

    // Last night, unticked, is waiting in «تدارك» with full points, as the hadith of the hizb.
    const list = (await v.get(`/api/tasks?date=${today()}&time=08:00&fajr=04:50&isha=18:19`)).body;
    expect(list.missed[0]).toMatchObject({ id: task.id, day: daysFromToday(-1), points: 10 });
    const made = await v.put(`/api/tasks/${task.id}/makeup`, { date: today(), time: '08:00', day: daysFromToday(-1), done: true, ...cairo });
    expect(made.body.points).toBe(10);
    expect((await tick('21:00')).status).toBe(200); // tonight, after Isha
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

describe('making up what was missed', () => {
  /** A daily task and a member that both existed a week ago. */
  async function setup(points = 10) {
    const m = await manager();
    const task = (await m.post('/api/tasks', { title: 'ورد القرآن', repeat: 'daily', points })).body.task;
    const v = await member('v@test.local', 'أحمد');
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    await prisma.task.update({ where: { id: task.id }, data: { createdAt: weekAgo } });
    await prisma.user.update({ where: { email: 'v@test.local' }, data: { createdAt: weekAgo } });
    const ahmad = (await prisma.user.findUnique({ where: { email: 'v@test.local' } }))!;
    return { m, v, task, ahmad };
  }
  const list = async (v: Awaited<ReturnType<typeof member>>) => (await v.get(`/api/tasks?date=${today()}&time=15:00`)).body;

  it('lists the last three days missed, full points for yesterday and half before', async () => {
    const { v, task } = await setup(15);
    const missed = (await list(v)).missed;
    expect(missed.map((x: { day: string; points: number }) => [x.day, x.points])).toEqual([
      [daysFromToday(-1), 15],
      [daysFromToday(-2), 8],
      [daysFromToday(-3), 8],
    ]);

    const res = await v.put(`/api/tasks/${task.id}/makeup`, { date: today(), time: '15:00', day: daysFromToday(-2), done: true });
    expect(res.status).toBe(200);
    expect(res.body.points).toBe(8);
    expect((await list(v)).missed).toHaveLength(2);
    const row = await prisma.taskCompletion.findFirst({ where: { day: daysFromToday(-2) } });
    expect(row).toMatchObject({ madeUp: true, points: 8, period: daysFromToday(-2) });
  });

  it('refuses days too far back, today, and days the task did not apply', async () => {
    const { v, task, m } = await setup();
    const makeup = (day: string) => v.put(`/api/tasks/${task.id}/makeup`, { date: today(), time: '15:00', day, done: true });
    expect((await makeup(daysFromToday(-4))).status).toBe(400);
    expect((await makeup(today())).status).toBe(400);
    await m.put(`/api/tasks/${task.id}`, { startDate: daysFromToday(-1) });
    expect((await makeup(daysFromToday(-2))).status).toBe(400);
    expect((await list(v)).missed.map((x: { day: string }) => x.day)).toEqual([daysFromToday(-1)]);
  });

  it('never lists days before the member joined or the task existed', async () => {
    const m = await manager();
    await m.post('/api/tasks', { title: 'ورد', repeat: 'daily' });
    const v = await member();
    expect((await list(v)).missed).toEqual([]);
  });

  it('undoing a make-up leaves an on-time tick alone', async () => {
    const { v, task, ahmad } = await setup();
    await prisma.taskCompletion.create({ data: { taskId: task.id, userId: ahmad.id, period: daysFromToday(-1), day: daysFromToday(-1) } });
    await v.put(`/api/tasks/${task.id}/makeup`, { date: today(), time: '15:00', day: daysFromToday(-1), done: false });
    expect(await prisma.taskCompletion.count()).toBe(1);
  });

  it('keeps the streak alive through made-up and excused days', async () => {
    const { v, task } = await setup();
    await v.put(`/api/tasks/${task.id}/done`, { date: today(), time: '15:00', done: true });
    await v.put(`/api/tasks/${task.id}/makeup`, { date: today(), time: '15:00', day: daysFromToday(-1), done: true });
    expect((await v.put('/api/tasks/excuse', { date: today(), day: daysFromToday(-2), reason: 'sick' })).status).toBe(200);
    const me = (await v.get(`/api/tasks/board?date=${today()}`)).body.members[0];
    expect(me).toMatchObject({ streak: 3, madeUp: 1, lastDay: today() });

    const body = await list(v);
    expect(body.missed.map((x: { day: string }) => x.day)).toEqual([daysFromToday(-3)]);
    expect(body.excuses).toEqual([{ day: daysFromToday(-2), reason: 'sick' }]);

    await v.put('/api/tasks/excuse', { date: today(), day: daysFromToday(-2), reason: null });
    expect((await list(v)).excuses).toEqual([]);
  });

  it('limits excuses to recent days and a week a month', async () => {
    const { v, ahmad } = await setup();
    expect((await v.put('/api/tasks/excuse', { date: today(), day: daysFromToday(-4), reason: 'travel' })).status).toBe(400);
    expect((await v.put('/api/tasks/excuse', { date: today(), day: daysFromToday(1), reason: 'travel' })).status).toBe(400);
    await prisma.taskExcuse.createMany({ data: [5, 8, 11, 14, 17, 20, 23].map((n) => ({ userId: ahmad.id, day: daysFromToday(-n), reason: 'travel' as const })) });
    expect((await v.put('/api/tasks/excuse', { date: today(), day: today(), reason: 'sick' })).status).toBe(400);
  });

  it('gives a comeback bonus on the first tick after two days away', async () => {
    const { v, task, ahmad } = await setup(10);
    await prisma.taskCompletion.create({ data: { taskId: task.id, userId: ahmad.id, period: daysFromToday(-5), day: daysFromToday(-5) } });
    const first = await v.put(`/api/tasks/${task.id}/done`, { date: today(), time: '15:00', done: true });
    expect(first.body).toMatchObject({ comeback: true, points: 15 });
    // Ticking twice keeps the points it was given; the day's next task is ordinary.
    expect((await v.put(`/api/tasks/${task.id}/done`, { date: today(), time: '15:00', done: true })).body.points).toBe(15);
    const other = (await (await manager2()).post('/api/tasks', { title: 'أذكار', repeat: 'daily' })).body.task;
    const second = await v.put(`/api/tasks/${other.id}/done`, { date: today(), time: '15:00', done: true });
    expect(second.body).toMatchObject({ comeback: false, points: 10 });
  });

  it('no comeback bonus for a first-ever tick or a regular day', async () => {
    const { v, task } = await setup();
    expect((await v.put(`/api/tasks/${task.id}/done`, { date: today(), time: '15:00', done: true })).body.comeback).toBe(false);
  });
});

async function manager2() {
  await createUser({ email: 'm2@test.local', canManageSchedule: true });
  return loginAs('m2@test.local');
}

describe('nudges', () => {
  it('lets a member gently remind another, once a day, three a day at most', async () => {
    const a = await member('a@test.local', 'أحمد');
    const target = await createUser({ email: 't@test.local', name: 'طارق' });
    const nudge = (c: Awaited<ReturnType<typeof member>>) => c.post(`/api/tasks/nudge/${target.id}`);

    expect((await nudge(a)).status).toBe(201);
    expect((await nudge(a)).status).toBe(429);
    const n = await prisma.notification.findFirst({ where: { userId: target.id } });
    expect(n).toMatchObject({ type: 'task_nudge' });

    expect((await nudge(await member('b@test.local'))).status).toBe(201);
    expect((await nudge(await member('c@test.local'))).status).toBe(201);
    expect((await nudge(await member('d@test.local'))).status).toBe(429);

    expect((await a.post(`/api/tasks/nudge/nobody`)).status).toBe(404);
    const self = (await prisma.user.findUnique({ where: { email: 'a@test.local' } }))!;
    expect((await a.post(`/api/tasks/nudge/${self.id}`)).status).toBe(400);

    const list = await (await loginAs('t@test.local')).get('/api/notifications');
    expect(list.body.notifications).toHaveLength(3);
    expect(list.body.notifications.at(-1)).toMatchObject({ type: 'task_nudge', actor: { name: 'أحمد' } });
  });
});

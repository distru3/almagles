import { beforeEach, describe, expect, it } from 'vitest';
import { client, createUser, loginAs, prisma, resetDb } from './helpers.js';
import { slotState, type HistoryTask, type MemberLog } from '../src/lib/taskHistory.js';
import { shiftDate } from '../src/lib/taskSchedule.js';

beforeEach(resetDb);

/** A Friday; its week started on Saturday 2026-11-14. */
const DAY = '2026-11-20';
const Q = `date=${DAY}&time=12:00&fajr=05:00&isha=18:30`;

async function manager() {
  await createUser({ email: 'm@test.local', canManageSchedule: true });
  return loginAs('m@test.local');
}

async function member(email: string, name = 'عضو') {
  const u = await createUser({ email, name });
  return { c: await loginAs(email), id: u.id };
}

/** A task created long ago, so the days before today count. */
async function task(m: Awaited<ReturnType<typeof manager>>, title: string, extra: Record<string, unknown> = {}) {
  const res = await m.post('/api/tasks', { title, repeat: 'daily', ...extra });
  await prisma.task.update({ where: { id: res.body.task.id }, data: { createdAt: new Date('2026-01-01T00:00:00Z') } });
  return res.body.task.id as string;
}

async function tick(taskId: string, userId: string, day: string, period = day) {
  await prisma.taskCompletion.create({ data: { taskId, userId, day, period, points: 10 } });
}

const historyTask = (over: Partial<HistoryTask> = {}): HistoryTask => ({
  id: 't',
  title: 'ورد القرآن',
  order: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  repeat: 'daily',
  startDate: null,
  endDate: null,
  weekdays: [],
  timeWindow: 'anytime',
  startTime: null,
  endTime: null,
  ...over,
});

describe('slot states', () => {
  const log = (over: Partial<MemberLog> = {}): MemberLog => ({ done: new Set(), excused: new Set(), firstDay: '2026-11-01', ...over });

  it('counts a day as missed only when the member could have done it', () => {
    const t = historyTask();
    expect(slotState(t, '2026-11-18', log({ done: new Set(['t|2026-11-18']) }), [], DAY)).toBe('done');
    expect(slotState(t, '2026-11-18', log(), [], DAY)).toBe('miss');
    expect(slotState(t, DAY, log(), [], DAY)).toBe('pending'); // today isn't over
    expect(slotState(t, '2026-10-20', log(), [], DAY)).toBe('off'); // before they started
    expect(slotState(t, '2026-11-18', log({ excused: new Set(['2026-11-18']) }), [], DAY)).toBe('off');
    expect(slotState(historyTask({ createdAt: new Date('2026-11-19T10:00:00Z') }), '2026-11-18', log(), [], DAY)).toBe('off');
  });

  it('does not count a task as missed when its counterpart was done instead', () => {
    const onTime = historyTask({ id: 'a', title: 'صلاة الفجر في وقتها' });
    expect(slotState(onTime, '2026-11-18', log({ done: new Set(['b|2026-11-18']) }), ['b'], DAY)).toBe('off');
  });
});

describe('«سجلّي» — a member’s own history', () => {
  it('keeps every day since the start, not just this week', async () => {
    const m = await manager();
    const quran = await task(m, 'ورد القرآن');
    const { c, id } = await member('a@test.local');
    // Months ago, and every day of the last week but one.
    await tick(quran, id, '2026-03-02');
    for (let i = 1; i <= 7; i++) if (i !== 3) await tick(quran, id, shiftDate(DAY, -i));
    await tick(quran, id, DAY);

    const res = await c.get(`/api/tasks/history?${Q}`);
    expect(res.status).toBe(200);
    expect(res.body.days[0]).toEqual({ day: '2026-03-02', points: 10, count: 1, lessons: 0, ilmPoints: 0 });
    expect(res.body.days).toHaveLength(8);
    // The day-by-day log covers the last 26 weeks; March is older than that.
    expect(res.body.log.find((d: { day: string }) => d.day === '2026-03-02')).toBeUndefined();
    expect(res.body.log.find((d: { day: string }) => d.day === DAY).items[0]).toMatchObject({ taskId: quran, points: 10 });
    expect(res.body.titles[quran]).toBe('ورد القرآن');

    const t = res.body.tasks.find((x: { id: string }) => x.id === quran);
    expect(t.strip).toHaveLength(30);
    expect(t.strip.at(-1)).toBe('done');
    expect(t.strip.at(-4)).toBe('miss'); // three days ago
    expect(t.streak).toBe(3); // today and the two days before the gap
    expect(t.total).toBe(8);
    // Since the first tick in March, every one of the last 30 days was a chance.
    expect(t).toMatchObject({ kept: 7, possible: 30 });
  });

  it('only ever shows the member their own record', async () => {
    const m = await manager();
    const quran = await task(m, 'ورد القرآن');
    const a = await member('a@test.local');
    const b = await member('b@test.local');
    await tick(quran, b.id, '2026-11-19');
    const res = await a.c.get(`/api/tasks/history?${Q}`);
    expect(res.body.days).toEqual([]);
    expect(res.body.tasks[0]).toMatchObject({ kept: 0, possible: 0, total: 0 });
  });

  it('needs a signed-in member', async () => {
    expect((await (await client()).get(`/api/tasks/history?${Q}`)).status).toBe(401);
    expect((await (await client()).get(`/api/tasks/community?${Q}`)).status).toBe(401);
  });
});

describe('«حال المجلس» — the circle together', () => {
  it('ranks tasks by how faithfully members keep them, without naming anyone', async () => {
    const m = await manager();
    const quran = await task(m, 'ورد القرآن');
    const duha = await task(m, 'صلاة الضحى');
    const a = await member('a@test.local', 'أبو بكر');
    const b = await member('b@test.local', 'عمر');
    for (let i = 1; i <= 30; i++) {
      await tick(quran, a.id, shiftDate(DAY, -i));
      await tick(quran, b.id, shiftDate(DAY, -i));
    }
    await tick(duha, a.id, shiftDate(DAY, -2));

    const res = await a.c.get(`/api/tasks/community?${Q}`);
    expect(res.status).toBe(200);
    expect(res.body.members).toBe(2);
    expect(res.body.totals).toMatchObject({ ticks: 61, points: 610 });
    expect(res.body.tasks.map((t: { id: string }) => t.id)).toEqual([quran, duha]);
    expect(res.body.tasks[0].rate).toBe(1);
    expect(res.body.tasks[1]).toMatchObject({ kept: 1, possible: 60 });
    expect(res.body.series).toHaveLength(56);
    expect(res.body.series.at(-2)).toEqual({ day: shiftDate(DAY, -1), count: 2, ilm: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(/أبو بكر|عمر|a@test|b@test/);
  });

  it('picks the least-kept task of last month as «همّة الأسبوع», and tracks this week', async () => {
    const m = await manager();
    const quran = await task(m, 'ورد القرآن');
    const duha = await task(m, 'صلاة الضحى');
    const a = await member('a@test.local');
    for (let i = 1; i <= 20; i++) await tick(quran, a.id, shiftDate('2026-11-14', -i));
    await tick(duha, a.id, '2026-11-15'); // this week, after the choice was made

    const res = await a.c.get(`/api/tasks/community?${Q}`);
    expect(res.body.focus).toMatchObject({ id: duha, title: 'صلاة الضحى', before: 0 });
    // Saturday → Thursday are past (6 chances), one kept; Friday (today) is still open.
    expect(res.body.focus.week).toEqual({ kept: 1, possible: 6 });
  });

  it('does not count a member against a task when they did its counterpart', async () => {
    const m = await manager();
    const jamaah = await task(m, 'صلاة الفجر في جماعة');
    const onTime = await task(m, 'صلاة الفجر في وقتها');
    const a = await member('a@test.local');
    for (let i = 1; i <= 30; i++) await tick(jamaah, a.id, shiftDate(DAY, -i));
    const res = await a.c.get(`/api/tasks/community?${Q}`);
    expect(res.body.tasks.map((t: { id: string }) => t.id)).toEqual([jamaah]); // «في وقتها» had no real chance
  });
});

describe('every kind of task is tracked', () => {
  it('shows one-off tasks, and keeps finished tasks under the past record', async () => {
    const m = await manager();
    const book = await task(m, 'قراءة كتاب الأربعين النووية', { repeat: 'once' });
    const old = await task(m, 'ورد القرآن');
    const a = await member('a@test.local');
    await tick(book, a.id, '2026-11-10', 'once');
    await tick(old, a.id, '2026-10-01');
    await prisma.task.update({ where: { id: old }, data: { active: false } });

    const res = await a.c.get(`/api/tasks/history?${Q}`);
    const once = res.body.tasks.find((t: { id: string }) => t.id === book);
    expect(once).toMatchObject({ repeat: 'once', kept: 1, total: 1, lastDay: '2026-11-10', strip: [] });
    expect(res.body.tasks.find((t: { id: string }) => t.id === old)).toBeUndefined();
    expect(res.body.past).toEqual([expect.objectContaining({ id: old, title: 'ورد القرآن', total: 1, lastDay: '2026-10-01' })]);
  });

  it('counts how many active brothers did a one-off task, even long ago', async () => {
    const m = await manager();
    const book = await task(m, 'قراءة كتاب الأربعين النووية', { repeat: 'once' });
    const quran = await task(m, 'ورد القرآن');
    const a = await member('a@test.local');
    const b = await member('b@test.local');
    await tick(book, a.id, '2026-06-01', 'once');
    await tick(quran, a.id, shiftDate(DAY, -1));
    await tick(quran, b.id, shiftDate(DAY, -1));

    const res = await a.c.get(`/api/tasks/community?${Q}`);
    expect(res.body.tasks.find((t: { id: string }) => t.id === book)).toMatchObject({ repeat: 'once', kept: 1, possible: 2, rate: 0.5 });
    expect(res.body.focus?.id).not.toBe(book); // a one-off can't be revived weekly
  });
});

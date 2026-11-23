import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { client, createUser, loginAs, prisma, resetDb } from './helpers.js';
import { LEARN_MAKEUP_DAYS, isRestDay, learningPoints, learningStreak, pageProgress, progressPoints } from '../src/lib/learning.js';
import { shiftDate } from '../src/lib/taskSchedule.js';
import { MAX_LEARNING_FILE_BYTES, learningFileStore } from '../src/lib/learningFiles.js';
import { MAX_NOTES_PER_LESSON } from '../src/routes/learning.js';

beforeEach(resetDb);

/** The member's "today" — never a Friday, which holds no lessons (tomorrow is still near enough). */
const now = new Date().toISOString().slice(0, 10);
const today = isRestDay(now) ? shiftDate(now, 1) : now;
/** The lesson day `n` days back, stepping past a Friday. */
const back = (n: number) => {
  const d = shiftDate(today, -n);
  return isRestDay(d) ? shiftDate(d, -1) : d;
};

async function lesson(date: string, extra: Record<string, unknown> = {}) {
  return prisma.learningItem.create({ data: { date, kind: 'reading', title: `درس ${date}`, points: 20, ...extra } });
}

async function joined(email = 'a@test.local', name?: string) {
  await createUser({ email, name });
  const c = await loginAs(email);
  expect((await c.put('/api/learning/enrollment', { date: today, active: true })).status).toBe(200);
  return c;
}

describe('the rules of «رحلة العلم»', () => {
  it('rests on Friday', () => {
    expect(isRestDay('2026-11-20')).toBe(true);
    expect(isRestDay('2026-11-21')).toBe(false);
  });

  it('gives full points on the day and the next, half within the week, none after or before', () => {
    expect(learningPoints(20, '2026-11-22', '2026-11-22')).toBe(20);
    expect(learningPoints(20, '2026-11-22', '2026-11-23')).toBe(20);
    expect(learningPoints(15, '2026-11-22', '2026-11-25')).toBe(8);
    expect(learningPoints(20, '2026-11-22', shiftDate('2026-11-22', LEARN_MAKEUP_DAYS + 1))).toBeNull();
    expect(learningPoints(20, '2026-11-23', '2026-11-22')).toBeNull();
  });

  it('keeps the streak across Fridays, excused days, days before joining and an unfinished today', () => {
    // Thu 19, (Fri 20), Sat 21, Sun 22, Mon 23 = today.
    const lessons = ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-21', '2026-11-22', '2026-11-23'];
    const done = new Set(['2026-11-19', '2026-11-22']);
    const excused = new Set(['2026-11-21']);
    expect(learningStreak(lessons, done, excused, '2026-11-23', '2026-11-19')).toEqual({ streak: 2, bestStreak: 2 });
    // Without the excuse, Saturday breaks it.
    expect(learningStreak(lessons, done, new Set(), '2026-11-23', '2026-11-19')).toEqual({ streak: 1, bestStreak: 1 });
    // Without a start day, the days before count as missed.
    expect(learningStreak(lessons, new Set(['2026-11-22']), new Set(), '2026-11-23', null).streak).toBe(1);
  });
});

describe('joining the journey', () => {
  it('needs a signed-in member', async () => {
    expect((await (await client()).get(`/api/learning?date=${today}`)).status).toBe(401);
  });

  it('asks nothing of a member who hasn’t joined, and lets them decline in peace', async () => {
    await createUser({ email: 'a@test.local' });
    const c = await loginAs('a@test.local');
    const item = await lesson(today);
    const before = await c.get(`/api/learning?date=${today}`);
    expect(before.status).toBe(200);
    expect(before.body.enrollment).toBeNull();
    expect(before.body.items.map((i: { id: string }) => i.id)).toContain(item.id);

    expect((await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true })).status).toBe(403);
    const declined = await c.put('/api/learning/enrollment', { date: today, active: false });
    expect(declined.body.enrollment).toEqual({ active: false, startDay: null });
    expect((await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true })).status).toBe(403);
  });

  it('counts from the day a member joins, and keeps that day if they press «ابدأ» again', async () => {
    const c = await joined();
    await c.put('/api/learning/enrollment', { date: today, active: true });
    expect((await prisma.learningEnrollment.findFirst())!.startDay).toBe(today);
  });

  it('keeps what a member did when they leave', async () => {
    const c = await joined();
    const item = await lesson(today);
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    await c.put('/api/learning/enrollment', { date: today, active: false });
    const { body } = await c.get(`/api/learning?date=${today}`);
    expect(body.enrollment.active).toBe(false);
    expect(body.stats.done).toBe(1);
  });
});

describe('finishing lessons', () => {
  it('earns the full points for today’s lesson and tells when the whole day is done', async () => {
    const c = await joined();
    const [a, b] = [await lesson(today), await lesson(today, { title: 'محاضرة' })];
    const first = await c.put(`/api/learning/items/${a.id}/done`, { date: today, done: true });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ points: 20, madeUp: false, dayDone: false });
    const second = await c.put(`/api/learning/items/${b.id}/done`, { date: today, done: true });
    expect(second.body.dayDone).toBe(true);

    const { body } = await c.get(`/api/learning?date=${today}`);
    const mine = body.items.find((i: { id: string }) => i.id === a.id);
    expect(mine).toMatchObject({ done: true, earned: 20, doneCount: 1, worth: null });
    expect(body.stats).toMatchObject({ done: 2, total: 2, points: 40, streak: 1 });
  });

  it('catches up a missed lesson within the week for half its points, and no further', async () => {
    const c = await joined();
    const missed = await lesson(back(3));
    const old = await lesson(back(LEARN_MAKEUP_DAYS + 2));
    const res = await c.put(`/api/learning/items/${missed.id}/done`, { date: today, done: true });
    expect(res.body).toMatchObject({ points: 10, madeUp: true });
    expect((await prisma.learningCompletion.findFirst())!.day).toBe(missed.date);
    expect((await c.put(`/api/learning/items/${old.id}/done`, { date: today, done: true })).status).toBe(400);
  });

  it('won’t tick a lesson whose day hasn’t come', async () => {
    const c = await joined();
    const later = await lesson(shiftDate(today, isRestDay(shiftDate(today, 2)) ? 3 : 2));
    const res = await c.put(`/api/learning/items/${later.id}/done`, { date: today, done: true });
    expect(res.status).toBe(400);
  });

  it('keeps «فوائدي» for the member alone', async () => {
    const a = await joined('a@test.local');
    const b = await joined('b@test.local');
    const item = await lesson(today);
    await a.put(`/api/learning/items/${item.id}/done`, { date: today, done: true, note: 'الإخلاص أول العمل' });
    await b.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    const mine = (await a.get(`/api/learning?date=${today}`)).body.items[0];
    const theirs = (await b.get(`/api/learning?date=${today}`)).body.items[0];
    expect(mine.notes.map((n: { text: string }) => n.text)).toEqual(['الإخلاص أول العمل']);
    expect(theirs.notes).toEqual([]);
    expect(theirs.doneCount).toBe(2);
    const companions = await b.get(`/api/learning/companions?date=${today}`);
    expect(JSON.stringify(companions.body)).not.toContain('الإخلاص');

    // Another member can neither change nor delete it.
    const id = mine.notes[0].id;
    expect((await b.put(`/api/learning/items/${item.id}/notes/${id}`, { text: 'غيره' })).status).toBe(404);
    expect((await b.del(`/api/learning/items/${item.id}/notes/${id}`)).status).toBe(404);
    expect((await prisma.learningNote.findUnique({ where: { id } }))!.text).toBe('الإخلاص أول العمل');
  });

  it('holds several «فوائد» on one lesson, each edited or removed on its own', async () => {
    const c = await joined();
    const item = await lesson(today);
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    const first = await c.post(`/api/learning/items/${item.id}/notes`, { text: ' العلم قبل القول والعمل ' });
    expect(first.status).toBe(201);
    expect(first.body.note.text).toBe('العلم قبل القول والعمل');
    const second = await c.post(`/api/learning/items/${item.id}/notes`, { text: 'أعزم على مراجعة الدرس غدًا' });
    expect((await c.post(`/api/learning/items/${item.id}/notes`, { text: '   ' })).status).toBe(400);

    const edited = await c.put(`/api/learning/items/${item.id}/notes/${second.body.note.id}`, { text: 'راجعه بعد الفجر' });
    expect(edited.body.note.text).toBe('راجعه بعد الفجر');
    expect((await c.del(`/api/learning/items/${item.id}/notes/${first.body.note.id}`)).status).toBe(200);

    const journey = (await c.get(`/api/learning?date=${today}`)).body;
    expect(journey.items[0].notes.map((n: { text: string }) => n.text)).toEqual(['راجعه بعد الفجر']);
    expect(journey.stats.notes).toBe(1);
  });

  it('takes «فوائد» on a lesson only begun, but not on one not started', async () => {
    const c = await joined();
    const item = await lesson(today);
    const before = await c.post(`/api/learning/items/${item.id}/notes`, { text: 'فائدة' });
    expect(before.status).toBe(404);
    await c.put(`/api/learning/items/${item.id}/progress`, { date: today, progress: 50 });
    expect((await c.post(`/api/learning/items/${item.id}/notes`, { text: 'فائدة من نصفه' })).status).toBe(201);
  });

  it('stops at the most «فوائد» a lesson may hold', async () => {
    const c = await joined();
    const item = await lesson(today);
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    const completion = await prisma.learningCompletion.findFirstOrThrow();
    await prisma.learningNote.createMany({ data: Array.from({ length: MAX_NOTES_PER_LESSON }, (_, i) => ({ completionId: completion.id, text: `فائدة ${i}` })) });
    expect((await c.post(`/api/learning/items/${item.id}/notes`, { text: 'واحدة أخرى' })).status).toBe(400);
  });

  it('unticking a lesson removes its «فوائد» with it', async () => {
    const c = await joined();
    const item = await lesson(today);
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true, note: 'فائدة' });
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: false });
    expect(await prisma.learningNote.count()).toBe(0);
  });

  it('unticking takes the lesson and its points back', async () => {
    const c = await joined();
    const item = await lesson(today);
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: false });
    expect(await prisma.learningCompletion.count()).toBe(0);
  });
});

describe('«رفقاء الرحلة» and «ساحة الهمّة»', () => {
  it('lists the members on the journey with their progress, not those who declined', async () => {
    const a = await joined('a@test.local', 'أحمد');
    await joined('b@test.local', 'بلال');
    await createUser({ email: 'c@test.local', name: 'خالد' });
    await (await loginAs('c@test.local')).put('/api/learning/enrollment', { date: today, active: false });
    const item = await lesson(today);
    await a.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });

    const { body } = await a.get(`/api/learning/companions?date=${today}`);
    expect(body.todayCount).toBe(1);
    expect(body.members.map((m: { name: string }) => m.name)).toEqual(['أحمد', 'بلال']);
    expect(body.members[0]).toMatchObject({ done: 1, todayDone: 1, points: 20, streak: 1 });
  });

  it('counts lesson points on «ساحة الهمّة» beside the tasks', async () => {
    const c = await joined();
    const item = await lesson(today);
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    const { body } = await c.get(`/api/tasks/board?date=${today}`);
    expect(body.members[0]).toMatchObject({ total: 20, week: 20, today: 1, ticks: 1, streak: 1 });
    expect(body.recent[0]).toMatchObject({ title: item.title, points: 20, learning: true });
  });
});

describe('writing the calendar', () => {
  async function manager() {
    await createUser({ email: 'm@test.local', canManageSchedule: true });
    return loginAs('m@test.local');
  }

  it('leaves Friday for rest', async () => {
    const m = await manager();
    const res = await m.post('/api/learning/items', { date: '2026-11-20', kind: 'video', title: 'محاضرة' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('الجمعة');
  });

  it('lays out a book over many days, each after its day’s other lessons', async () => {
    const m = await manager();
    await m.post('/api/learning/items', { date: '2026-11-21', kind: 'video', title: 'محاضرة' });
    const plan = ['2026-11-21', '2026-11-22', '2026-11-23'].map((date, i) => ({
      date,
      kind: 'reading',
      title: 'رياض الصالحين',
      portion: `ص ${i * 10 + 1}–${i * 10 + 10}`,
    }));
    const res = await m.post('/api/learning/items/bulk', { items: plan });
    expect(res.status).toBe(201);
    expect(res.body.items.map((i: { order: number }) => i.order)).toEqual([1, 0, 0]);
    const withFriday = await m.post('/api/learning/items/bulk', { items: [{ ...plan[0], date: '2026-11-20' }] });
    expect(withFriday.status).toBe(400);
    expect(await prisma.learningItem.count()).toBe(4);
  });

  it('moves the members’ ticks with a lesson moved to another day, and deletes them with it', async () => {
    const m = await manager();
    const c = await joined();
    const item = await lesson(today);
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    const moved = await m.put(`/api/learning/items/${item.id}`, { date: '2026-11-21' });
    expect(moved.body.item).toMatchObject({ date: '2026-11-21', doneCount: 1 });
    expect((await prisma.learningCompletion.findFirst())!.day).toBe('2026-11-21');

    const listed = await m.get('/api/learning/manage?from=2026-11-01&to=2026-11-30');
    expect(listed.body).toMatchObject({ members: 1, items: [{ id: item.id, doneCount: 1 }] });

    expect((await m.del(`/api/learning/items/${item.id}`)).status).toBe(200);
    expect(await prisma.learningCompletion.count()).toBe(0);
  });
});

describe('PDFs attached to lessons', () => {
  const realStore = { ...learningFileStore };
  let removed: string[] = [];
  let n = 0;

  beforeEach(() => {
    removed = [];
    learningFileStore.upload = async () => {
      n += 1;
      return { publicId: `learning/book${n}`, url: `https://res.cloudinary.com/demo/image/upload/learning/book${n}.pdf`, pages: 40 };
    };
    learningFileStore.remove = async (publicId) => {
      removed.push(publicId);
    };
  });
  afterEach(() => {
    Object.assign(learningFileStore, realStore);
  });

  async function manager() {
    await createUser({ email: 'm@test.local', canManageSchedule: true });
    return loginAs('m@test.local');
  }
  const upload = (c: Awaited<ReturnType<typeof loginAs>>, body: Buffer, name = 'رياض الصالحين.pdf') =>
    c.agent.post('/api/learning/files').set('X-CSRF-Token', c.csrf).attach('file', body, { filename: name, contentType: 'application/pdf' });
  const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');

  it('takes only real PDFs, and only from managers', async () => {
    await createUser({ email: 'v@test.local' });
    expect((await upload(await loginAs('v@test.local'), PDF)).status).toBe(403);
    const m = await manager();
    const fake = await upload(m, Buffer.from('<html>not a book</html>'), 'book.pdf');
    expect(fake.status).toBe(400);
    const res = await upload(m, PDF);
    expect(res.status).toBe(201);
    expect(res.body.file).toMatchObject({ publicId: 'learning/book1', pages: 40, bytes: PDF.length });
  });

  it('refuses a file over the size limit', async () => {
    const m = await manager();
    const big = Buffer.concat([PDF, Buffer.alloc(MAX_LEARNING_FILE_BYTES)]);
    const res = await upload(m, big);
    expect(res.status).toBe(413);
    expect(res.body.message).toContain('ميغابايت');
  });

  it('won’t attach a file from anywhere else', async () => {
    const m = await manager();
    const res = await m.post('/api/learning/items', {
      date: '2026-11-21',
      kind: 'reading',
      title: 'كتاب',
      filePublicId: 'learning/x',
      fileUrl: 'https://evil.example/book.pdf',
    });
    expect(res.status).toBe(400);
  });

  it('shows the file to members, and deletes it with the last lesson that uses it', async () => {
    const m = await manager();
    const { file } = (await upload(m, PDF)).body;
    const fields = { filePublicId: file.publicId, fileUrl: file.url, fileName: file.name, fileBytes: file.bytes, filePages: file.pages };
    const plan = [today, shiftDate(today, isRestDay(shiftDate(today, 1)) ? 2 : 1)].map((date, i) => ({ date, kind: 'reading', title: 'رياض الصالحين', startPage: i * 10 + 1, ...fields }));
    const { items } = (await m.post('/api/learning/items/bulk', { items: plan })).body;

    const c = await joined();
    const seen = (await c.get(`/api/learning?date=${today}`)).body.items.find((i: { id: string }) => i.id === items[0].id);
    expect(seen).toMatchObject({ fileUrl: file.url, fileName: 'رياض الصالحين.pdf', filePages: 40, startPage: 1 });

    // Editing other fields keeps the file.
    expect((await m.put(`/api/learning/items/${items[0].id}`, { title: 'رياض الصالحين — المقدمة' })).body.item.fileUrl).toBe(file.url);
    await m.del(`/api/learning/items/${items[0].id}`);
    expect(removed).toEqual([]);
    // Taking the file off the last lesson removes it from storage.
    const off = await m.put(`/api/learning/items/${items[1].id}`, { filePublicId: null });
    expect(off.body.item).toMatchObject({ fileUrl: null, startPage: null });
    expect(removed).toEqual([file.publicId]);
  });

  it('throws away an upload no lesson took, but never one in use', async () => {
    const m = await manager();
    const a = (await upload(m, PDF)).body.file;
    const b = (await upload(m, PDF)).body.file;
    await m.post('/api/learning/items', { date: '2026-11-21', kind: 'reading', title: 'كتاب', filePublicId: b.publicId, fileUrl: b.url });
    await m.del(`/api/learning/files/${a.publicId}`);
    await m.del(`/api/learning/files/${b.publicId}`);
    expect(removed).toEqual([a.publicId]);
    expect((await m.del('/api/learning/files/posts/abc')).status).toBe(400);
  });
});

describe('one race, in worship and in «طلب العلم»', () => {
  async function taskTicked(c: Awaited<ReturnType<typeof loginAs>>, points = 10) {
    const task = await prisma.task.create({ data: { title: `مهمة ${points}`, repeat: 'daily', points } });
    expect((await c.put(`/api/tasks/${task.id}/done`, { date: today, time: '12:00', done: true })).status).toBe(200);
    return task;
  }

  it('shows each member’s week in worship and in learning, and who was first to today’s lesson', async () => {
    const a = await joined('a@test.local', 'أحمد');
    const b = await joined('b@test.local', 'بلال');
    const item = await lesson(today);
    await taskTicked(a, 10);
    await b.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    await a.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });

    const { body } = await a.get(`/api/tasks/board?date=${today}`);
    const ahmad = body.members.find((m: { name: string }) => m.name === 'أحمد');
    expect(ahmad).toMatchObject({ week: 30, ilmWeek: 20, ilmTotal: 20, lessons: 1, ilmStreak: 1 });
    expect(body.firstIlm.name).toBe('بلال');
  });

  it('gives «طالب علم» for ten lessons and «ملازم العلم» for seven lesson days in a row', async () => {
    const c = await joined();
    const user = (await prisma.user.findFirst({ where: { email: 'a@test.local' } }))!;
    // Seven lesson days back from today (Fridays skipped), plus three more lessons today.
    const dates: string[] = [];
    for (let d = today; dates.length < 7; d = shiftDate(d, -1)) if (!isRestDay(d)) dates.push(d);
    await prisma.learningEnrollment.update({ where: { userId: user.id }, data: { startDay: dates[6] } });
    for (const [i, date] of [...dates, today, today, today].entries()) {
      const item = await lesson(date, { title: `درس ${i}` });
      await prisma.learningCompletion.create({ data: { itemId: item.id, userId: user.id, day: date, points: 20 } });
    }
    const me = (await c.get(`/api/tasks/board?date=${today}`)).body.members[0];
    expect(me.lessons).toBe(10);
    expect(me.ilmStreak).toBe(7);
    expect(me.badges).toEqual(expect.arrayContaining(['talib', 'mulazim']));
  });

  it('keeps lessons in «سجلّي», day by day, apart from how each task is kept', async () => {
    const c = await joined();
    const item = await lesson(today);
    await taskTicked(c, 10);
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    const { body } = await c.get(`/api/tasks/history?date=${today}&time=12:00`);
    expect(body.days.find((d: { day: string }) => d.day === today)).toMatchObject({ points: 30, count: 2, lessons: 1, ilmPoints: 20 });
    const log = body.log.find((l: { day: string }) => l.day === today).items;
    expect(log).toEqual(expect.arrayContaining([expect.objectContaining({ taskId: `lesson:${item.id}`, learning: true, points: 20 })]));
    expect(body.titles[`lesson:${item.id}`]).toBe(item.title);
    expect(body.learning).toMatchObject({ enrolled: true, lessons: 1, points: 20, streak: 1 });
  });

  it('counts the circle’s lessons in «حال المجلس»', async () => {
    const a = await joined('a@test.local');
    const item = await lesson(today);
    await taskTicked(a, 10);
    await a.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    const { body } = await a.get(`/api/tasks/community?date=${today}&time=12:00`);
    expect(body.totals).toMatchObject({ lessons: 1, ilmPoints: 20, learners: 1 });
    expect(body.series.find((s: { day: string }) => s.day === today)).toMatchObject({ count: 2, ilm: 1 });
  });

  it('shows this week’s learning points among «رفقاء الرحلة»', async () => {
    const a = await joined('a@test.local');
    const item = await lesson(today);
    await a.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    const { body } = await a.get(`/api/learning/companions?date=${today}`);
    expect(body.members[0].week).toBe(20);
  });
});

describe('part of a lesson, and «طلب العلم» ticked by the journey', () => {
  it('measures part of a lesson by its pages, never reaching «finished» by reading alone', () => {
    expect(pageProgress(12, 20, 16)).toBe(55);
    expect(pageProgress(12, 20, 11)).toBe(0);
    expect(pageProgress(12, 20, 20)).toBe(99);
    expect(pageProgress(12, null, 16)).toBeNull();
    expect(progressPoints(20, today, today, 0, 50)).toBe(10);
    expect(progressPoints(20, back(3), today, 50, 100)).toBe(5);
  });

  it('earns a share of the points for part of a lesson, and the rest on finishing it', async () => {
    const c = await joined();
    const item = await lesson(today, { startPage: 11, endPage: 20 });
    const part = await c.put(`/api/learning/items/${item.id}/progress`, { date: today, page: 15 });
    expect(part.status).toBe(200);
    expect(part.body).toMatchObject({ done: false, progress: 50, page: 15, points: 10 });
    // Reading back over earlier pages takes nothing away, but remembers where they are.
    const back_ = await c.put(`/api/learning/items/${item.id}/progress`, { date: today, page: 12 });
    expect(back_.body).toMatchObject({ progress: 50, page: 12, points: 10 });

    const done = await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    expect(done.body).toMatchObject({ done: true, progress: 100, points: 20, dayDone: true });
    const mine = (await c.get(`/api/learning?date=${today}`)).body;
    expect(mine.stats).toMatchObject({ done: 1, points: 20 });
  });

  it('takes «ربعه / نصفه / أكثره» for a lesson with no pages, and won’t record before the lesson starts', async () => {
    const c = await joined();
    const video = await lesson(today, { kind: 'video' });
    expect((await c.put(`/api/learning/items/${video.id}/progress`, { date: today })).status).toBe(400);
    expect((await c.put(`/api/learning/items/${video.id}/progress`, { date: today, progress: 75 })).body).toMatchObject({ progress: 75, points: 15 });
    expect((await c.put(`/api/learning/items/${video.id}/progress`, { date: today, progress: 100 })).status).toBe(400);

    const book = await lesson(today, { title: 'كتاب', startPage: 30, endPage: 40 });
    expect((await c.put(`/api/learning/items/${book.id}/progress`, { date: today, page: 5 })).status).toBe(400);
  });

  it('counts part of a lesson for points and the streak, but not as a lesson finished', async () => {
    const a = await joined('a@test.local', 'أحمد');
    const item = await lesson(today, { startPage: 1, endPage: 10 });
    await a.put(`/api/learning/items/${item.id}/progress`, { date: today, page: 5 });

    const me = (await a.get(`/api/tasks/board?date=${today}`)).body.members.find((m: { name: string }) => m.name === 'أحمد');
    expect(me).toMatchObject({ ilmWeek: 10, lessons: 0, ilmStreak: 1 });
    expect((await a.get(`/api/tasks/board?date=${today}`)).body.firstIlm).toBeNull();
    const journey = (await a.get(`/api/learning?date=${today}`)).body;
    expect(journey.items[0]).toMatchObject({ done: false, progress: 50, page: 5, earned: 10, doneCount: 0, worth: 20 });
    expect(journey.stats).toMatchObject({ done: 0, points: 10, streak: 1 });
    const history = (await a.get(`/api/tasks/history?date=${today}&time=12:00`)).body;
    expect(history.days.find((d: { day: string }) => d.day === today)).toMatchObject({ points: 10, lessons: 0 });
    expect(history.log.find((l: { day: string }) => l.day === today).items[0]).toMatchObject({ learning: true, progress: 50 });
    expect((await a.get(`/api/learning/companions?date=${today}`)).body.members[0]).toMatchObject({ done: 0, todayDone: 0, week: 10 });
  });

  it('ticks the linked «طلب العلم» task on any part of a lesson, and no other task', async () => {
    const c = await joined();
    const linked = await prisma.task.create({ data: { title: 'طلب العلم', repeat: 'daily', points: 10, fromLearning: true } });
    const other = await prisma.task.create({ data: { title: 'ورد القرآن', repeat: 'daily', points: 10 } });
    const item = await lesson(today, { kind: 'video' });

    const res = await c.put(`/api/learning/items/${item.id}/progress`, { date: today, progress: 25 });
    expect(res.body.tasks).toEqual(['طلب العلم']);
    const tasks = (await c.get(`/api/tasks?date=${today}&time=12:00`)).body.tasks;
    expect(tasks.find((t: { id: string }) => t.id === linked.id)).toMatchObject({ done: true, fromLearning: true });
    expect(tasks.find((t: { id: string }) => t.id === other.id).done).toBe(false);

    // Finishing the lesson later doesn't tick it twice; unticking the lesson leaves the task ticked.
    expect((await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: true })).body.tasks).toEqual([]);
    await c.put(`/api/learning/items/${item.id}/done`, { date: today, done: false });
    expect(await prisma.taskCompletion.count({ where: { taskId: linked.id } })).toBe(1);
  });

  it('lets only managers link a task to the journey', async () => {
    await createUser({ email: 'm@test.local', role: 'admin' });
    const m = await loginAs('m@test.local');
    const made = await m.post('/api/tasks', { title: 'طلب العلم', repeat: 'daily', fromLearning: true });
    expect(made.status).toBe(201);
    expect(made.body.task.fromLearning).toBe(true);
    const v = await joined('v@test.local');
    expect((await v.put(`/api/tasks/${made.body.task.id}`, { fromLearning: false })).status).toBe(403);
  });

  it('keeps a lesson’s page range in order', async () => {
    await createUser({ email: 'm@test.local', role: 'admin' });
    const m = await loginAs('m@test.local');
    const bad = await m.post('/api/learning/items', { date: today, kind: 'reading', title: 'درس', startPage: 20, endPage: 10 });
    expect(bad.status).toBe(400);
    const good = await m.post('/api/learning/items', { date: today, kind: 'reading', title: 'درس', startPage: 10, endPage: 20 });
    expect(good.body.item).toMatchObject({ startPage: 10, endPage: 20 });
  });
});

describe('«فوائد الإخوة»', () => {
  async function sharedNote(c: Awaited<ReturnType<typeof joined>>, itemId: string, text: string, shared = true) {
    await c.put(`/api/learning/items/${itemId}/done`, { date: today, done: true });
    return (await c.post(`/api/learning/items/${itemId}/notes`, { text, shared })).body.note;
  }

  it('keeps a note private unless the member shares it', async () => {
    const a = await joined('a@test.local');
    const b = await joined('b@test.local');
    const item = await lesson(today);
    const secret = await sharedNote(a, item.id, 'بيني وبين نفسي', false);
    expect(secret.shared).toBe(false);
    const open = (await a.post(`/api/learning/items/${item.id}/notes`, { text: 'العلم رحم بين أهله', shared: true })).body.note;

    const feed = (await b.get('/api/learning/notes')).body.notes;
    expect(feed.map((n: { text: string }) => n.text)).toEqual(['العلم رحم بين أهله']);
    expect(feed[0]).toMatchObject({ id: open.id, author: { name: expect.any(String) }, lesson: { id: item.id }, replyCount: 0 });
    expect((await b.get(`/api/learning/notes/${secret.id}`)).status).toBe(404);
    expect((await b.get(`/api/learning?date=${today}`)).body.items[0].sharedCount).toBe(1);
    expect((await a.get(`/api/learning?date=${today}`)).body.items[0].sharedCount).toBe(0);

    // Sharing an older note later, and taking it back.
    await a.put(`/api/learning/items/${item.id}/notes/${secret.id}`, { shared: true });
    expect((await b.get(`/api/learning/notes?itemId=${item.id}`)).body.notes).toHaveLength(2);
    await a.put(`/api/learning/items/${item.id}/notes/${secret.id}`, { shared: false });
    expect((await b.get(`/api/learning/notes?itemId=${item.id}`)).body.notes).toHaveLength(1);
  });

  it('lets the brothers discuss a shared note, and tells its writer and those already in it', async () => {
    const a = await joined('a@test.local', 'أحمد');
    const b = await joined('b@test.local', 'بلال');
    const c = await joined('c@test.local', 'خالد');
    const item = await lesson(today);
    const note = await sharedNote(a, item.id, 'الصبر على الطلب');

    expect((await b.post(`/api/learning/notes/${note.id}/replies`, { text: 'جزاك الله خيرًا' })).status).toBe(201);
    expect((await c.post(`/api/learning/notes/${note.id}/replies`, { text: 'وفيها قول الشافعي' })).status).toBe(201);
    expect((await c.post(`/api/learning/notes/${note.id}/replies`, { text: '  ' })).status).toBe(400);

    const thread = (await c.get(`/api/learning/notes/${note.id}`)).body;
    expect(thread.replies.map((r: { text: string }) => r.text)).toEqual(['جزاك الله خيرًا', 'وفيها قول الشافعي']);
    expect(thread.note.replyCount).toBe(2);

    const notified = await prisma.notification.findMany({ where: { type: 'learning_note_reply' }, include: { user: { select: { name: true } } } });
    expect(notified.map((n) => n.user.name).sort()).toEqual(['أحمد', 'أحمد', 'بلال'].sort());
    const latest = (await a.get('/api/notifications')).body.notifications[0];
    expect(latest).toMatchObject({ type: 'learning_note_reply', learningNote: { id: note.id, mine: true, lessonTitle: item.title }, message: 'وفيها قول الشافعي' });
    expect((await b.get('/api/notifications')).body.notifications[0].learningNote.mine).toBe(false);
  });

  it('takes no replies on a private note', async () => {
    const a = await joined('a@test.local');
    const b = await joined('b@test.local');
    const item = await lesson(today);
    const note = await sharedNote(a, item.id, 'خاصة', false);
    expect((await b.post(`/api/learning/notes/${note.id}/replies`, { text: 'ردّ' })).status).toBe(404);
  });

  it('lets a reply go by its writer or a moderator, and a moderator hide a note', async () => {
    const a = await joined('a@test.local');
    const b = await joined('b@test.local');
    await createUser({ email: 'm@test.local', canManageSchedule: true });
    const m = await loginAs('m@test.local');
    const item = await lesson(today);
    const note = await sharedNote(a, item.id, 'فائدة');
    const r1 = (await b.post(`/api/learning/notes/${note.id}/replies`, { text: 'أول' })).body.reply;
    const r2 = (await b.post(`/api/learning/notes/${note.id}/replies`, { text: 'ثان' })).body.reply;

    expect((await a.del(`/api/learning/notes/${note.id}/replies/${r1.id}`)).status).toBe(404);
    expect((await b.del(`/api/learning/notes/${note.id}/replies/${r1.id}`)).status).toBe(200);
    expect((await m.del(`/api/learning/notes/${note.id}/replies/${r2.id}`)).status).toBe(200);

    expect((await b.post(`/api/learning/notes/${note.id}/unshare`)).status).toBe(403);
    expect((await m.post(`/api/learning/notes/${note.id}/unshare`)).status).toBe(200);
    expect((await b.get('/api/learning/notes')).body.notes).toHaveLength(0);
    // Still the writer's own.
    expect((await a.get(`/api/learning?date=${today}`)).body.items[0].notes[0]).toMatchObject({ text: 'فائدة', shared: false });
  });
});

describe('«تذكير الإخوة»', () => {
  async function manager() {
    await createUser({ email: 'm@test.local', name: 'المشرف', canManageSchedule: true });
    return loginAs('m@test.local');
  }

  it('shows each learner where they stand today', async () => {
    const a = await joined('a@test.local', 'أحمد');
    await joined('b@test.local', 'بلال');
    const c = await joined('c@test.local', 'خالد');
    const m = await manager();
    const item = await lesson(today);
    await a.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });
    await c.put(`/api/learning/items/${item.id}/progress`, { date: today, progress: 50 });
    const res = await m.get(`/api/learning/manage/learners?date=${today}`);
    const byName = Object.fromEntries(res.body.learners.map((l: { name: string; state: string }) => [l.name, l.state]));
    expect(byName).toEqual({ أحمد: 'done', بلال: 'not_started', خالد: 'partial' });
    expect(res.body.todayCount).toBe(1);
  });

  it('reminds those who have not finished the lesson of the day, once a day, with the supervisor word', async () => {
    const a = await joined('a@test.local', 'أحمد');
    await joined('b@test.local', 'بلال');
    const m = await manager();
    const item = await lesson(today);
    await a.put(`/api/learning/items/${item.id}/done`, { date: today, done: true });

    const res = await m.post('/api/learning/manage/remind', { date: today, message: 'لا تفوّتوا درس اليوم' });
    expect(res.body).toEqual({ sent: 1, skipped: 0 });
    const sent = await prisma.notification.findMany({ where: { type: 'learning_reminder' }, include: { user: { select: { name: true } } } });
    expect(sent.map((n) => [n.user.name, n.message])).toEqual([['بلال', 'لا تفوّتوا درس اليوم']]);

    expect((await m.post('/api/learning/manage/remind', { date: today })).body).toEqual({ sent: 0, skipped: 1 });
    // One by one too: the brother who finished can still be reminded, the reminded one not again.
    const ids = (await m.get(`/api/learning/manage/learners?date=${today}`)).body.learners.map((l: { id: string }) => l.id);
    expect((await m.post('/api/learning/manage/remind', { date: today, userIds: ids })).body).toEqual({ sent: 1, skipped: 1 });
  });

  it('has nothing to remind of on a day without a lesson', async () => {
    await joined('a@test.local');
    const m = await manager();
    expect((await m.post('/api/learning/manage/remind', { date: today })).status).toBe(400);
  });
});

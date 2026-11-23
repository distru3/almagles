import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireScheduleManager } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { linkUrlSchema } from '../lib/linkUrl.js';
import { parseDate, shiftDate, weekStartIso } from '../lib/taskSchedule.js';
import { LEARN_MAKEUP_DAYS, isRestDay, learningPoints, learningStreak, pageProgress, progressPoints } from '../lib/learning.js';
import { tickLearningTasks } from '../lib/taskTicks.js';
import { MAX_LEARNING_FILE_BYTES, isLearningFileId, isPdf, learningFileStore } from '../lib/learningFiles.js';
import { env } from '../env.js';

/**
 * «رحلة العلم»: a shared calendar of lessons — a portion of a book, a lecture,
 * an article — one or more each day, Fridays left for rest. Taking part is a
 * member's own choice: they join, or say «ليس الآن» and are left in peace.
 * Members tick the lessons they finish (on the day, or caught up within the
 * week), earn points that count on «ساحة الهمّة», and see how their
 * companions on the journey are doing. Admins and schedule managers write
 * the calendar.
 */
const router = Router();
const manage = [requireAuth, requireScheduleManager];

const DAY_MS = 86_400_000;
/** The widest window one request may ask for (a month view plus its edges). */
const MAX_RANGE_DAYS = 62;
/** Lessons one «خطة كتاب» may lay out at once. */
export const MAX_BULK_ITEMS = 120;
/** «فوائدي» one member may keep on one lesson — plenty for a reader, a bound for a script. */
export const MAX_NOTES_PER_LESSON = 20;

const anyDateSchema = z.string().refine((v) => parseDate(v) !== null, { message: 'تاريخ غير صالح' });
/** The member's own "today"; only a date near the server's, so nobody fills in the past after the fact. */
const todaySchema = anyDateSchema.refine((v) => Math.abs(parseDate(v)!.getTime() - Date.now()) <= 1.6 * DAY_MS, {
  message: 'لا يمكن التسجيل لهذا التاريخ',
});

const ITEM_SELECT = {
  id: true,
  date: true,
  kind: true,
  title: true,
  source: true,
  portion: true,
  description: true,
  linkUrl: true,
  fileUrl: true,
  filePublicId: true,
  fileName: true,
  fileBytes: true,
  filePages: true,
  startPage: true,
  endPage: true,
  minutes: true,
  points: true,
  order: true,
} as const;
const ORDER = [{ date: 'asc' as const }, { order: 'asc' as const }, { createdAt: 'asc' as const }];
/** A «فائدة» as the member sees it, oldest first. */
const NOTE_SELECT = { id: true, text: true, createdAt: true } as const;
const NOTE_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

const daysBetween = (a: string, b: string) => Math.round((parseDate(b)!.getTime() - parseDate(a)!.getTime()) / DAY_MS);

const rangeQuery = z
  .object({ date: anyDateSchema, from: anyDateSchema.optional(), to: anyDateSchema.optional() })
  .refine((q) => !q.from || !q.to || (q.from <= q.to && daysBetween(q.from, q.to) <= MAX_RANGE_DAYS), {
    message: 'المدة المطلوبة طويلة',
  });

// ---------------------------------------------------------------- members

/**
 * The member's journey: their choice (joined, declined, or not yet asked),
 * the lessons from `from` to `to` (and always the catch-up week and the
 * coming fortnight) with their own ticks and «فوائدي» and how many members
 * finished each, and their progress: lessons done of those due since they
 * joined, of the whole calendar, points and «سلسلة العلم».
 */
router.get('/', requireAuth, validate(rangeQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as z.infer<typeof rangeQuery>;
    const today = q.date;
    const userId = req.user!.id;
    const lo = [q.from ?? today, shiftDate(today, -LEARN_MAKEUP_DAYS)].sort()[0];
    const hi = [q.to ?? today, shiftDate(today, 14)].sort().reverse()[0];

    const [enrollment, items, allItems, mine, excuses, members] = await Promise.all([
      prisma.learningEnrollment.findUnique({ where: { userId }, select: { active: true, startDay: true } }),
      prisma.learningItem.findMany({ where: { date: { gte: lo, lte: hi } }, orderBy: ORDER, select: ITEM_SELECT }),
      prisma.learningItem.findMany({ select: { id: true, date: true } }),
      prisma.learningCompletion.findMany({
        where: { userId },
        select: { itemId: true, day: true, points: true, madeUp: true, progress: true, page: true, notes: { orderBy: NOTE_ORDER, select: NOTE_SELECT } },
      }),
      prisma.taskExcuse.findMany({ where: { userId }, select: { day: true } }),
      prisma.learningEnrollment.count({ where: { active: true } }),
    ]);
    const counts = items.length
      ? await prisma.learningCompletion.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) }, progress: 100 }, _count: { _all: true } })
      : [];
    const countOf = new Map(counts.map((c) => [c.itemId, c._count._all]));
    // What the member recorded of each lesson, finished or in part; `finished` only the former.
    const doneOf = new Map(mine.map((c) => [c.itemId, c]));
    const finished = mine.filter((c) => c.progress >= 100);
    const finishedIds = new Set(finished.map((c) => c.itemId));

    const startDay = enrollment?.startDay ?? null;
    const due = allItems.filter((i) => i.date <= today && (!startDay || i.date >= startDay));
    // Part of a lesson keeps «سلسلة العلم» going: it was a day of learning.
    const doneDays = new Set(mine.map((c) => c.day));
    const { streak, bestStreak } = learningStreak(
      allItems.map((i) => i.date),
      doneDays,
      new Set(excuses.map((e) => e.day)),
      today,
      startDay,
    );

    return res.json({
      today,
      restDay: isRestDay(today),
      enrollment,
      members,
      items: items.map((i) => {
        const c = doneOf.get(i.id);
        const done = (c?.progress ?? 0) >= 100;
        const rest = c && !done ? progressPoints(i.points, i.date, today, c.progress, 100) : null;
        return {
          ...i,
          done,
          /** How much is done, 0–100; between, it's «أنجزت بعضه». */
          progress: c?.progress ?? 0,
          /** The page of the PDF where the member stopped, from any device. */
          page: c?.page ?? null,
          madeUp: c?.madeUp ?? false,
          earned: c?.points ?? 0,
          notes: c?.notes ?? [],
          doneCount: countOf.get(i.id) ?? 0,
          /** What finishing it now would bring it to in all; null when it can't be ticked today. */
          worth: done ? null : c ? (rest === null ? null : Math.min(i.points, c.points + rest)) : learningPoints(i.points, i.date, today),
        };
      }),
      stats: {
        done: finished.length,
        total: allItems.length,
        due: due.length,
        keptDue: due.filter((i) => finishedIds.has(i.id)).length,
        points: mine.reduce((n, c) => n + c.points, 0),
        madeUp: finished.filter((c) => c.madeUp).length,
        notes: mine.reduce((n, c) => n + c.notes.length, 0),
        streak,
        bestStreak,
        /** The last day with a lesson, so the member can see where the journey ends for now. */
        lastDay: allItems.reduce<string | null>((m, i) => (!m || i.date > m ? i.date : m), null),
      },
    });
  } catch (err) {
    next(err);
  }
});

const enrollSchema = z.object({ date: todaySchema, active: z.boolean() });

/**
 * Join («ابدأ الرحلة») or step aside («ليس الآن», «مغادرة الرحلة»). Leaving
 * keeps every lesson done; joining again starts counting from that day.
 */
router.put('/enrollment', requireAuth, validate(enrollSchema), async (req, res, next) => {
  try {
    const { date, active } = req.body as z.infer<typeof enrollSchema>;
    const userId = req.user!.id;
    const existing = await prisma.learningEnrollment.findUnique({ where: { userId }, select: { active: true, startDay: true } });
    // Joining while already on the journey keeps the day they started.
    const startDay = active ? (existing?.active ? existing.startDay : date) : (existing?.startDay ?? null);
    const enrollment = await prisma.learningEnrollment.upsert({
      where: { userId },
      create: { userId, active, startDay },
      update: { active, startDay },
      select: { active: true, startDay: true },
    });
    return res.json({ enrollment });
  } catch (err) {
    next(err);
  }
});

async function requireJoined(userId: string) {
  const e = await prisma.learningEnrollment.findUnique({ where: { userId }, select: { active: true } });
  if (!e?.active) throw new HttpError(403, 'انضم إلى «رحلة العلم» أولاً');
}

const noteText = z.string().trim().min(1, 'اكتب الفائدة أولاً').max(1000, 'الفائدة طويلة — اختصرها في سطور');
/** With «أتممت الدرس», a first فائدة may come along; empty means none. */
const doneNote = z
  .string()
  .trim()
  .max(1000, 'الفائدة طويلة — اختصرها في سطور')
  .nullish()
  .transform((v) => v || null);
const doneSchema = z.object({ date: todaySchema, done: z.boolean(), note: doneNote.optional() });
const noteSchema = z.object({ text: noteText });
const pageSchema = z.number().int().min(1, 'رقم الصفحة غير صالح').max(100000, 'رقم الصفحة غير صالح');
const progressSchema = z.object({
  date: todaySchema,
  /** Where the member stopped in the lesson's PDF. */
  page: pageSchema.optional(),
  /** «أنجزت بعضه» for a lesson with no page range: ربعه / نصفه / أكثره. */
  progress: z.number().int().min(1, 'المقدار غير صالح').max(99, 'المقدار غير صالح').optional(),
});

type LessonForRecord = { id: string; date: string; points: number };

/**
 * Raise a member's record of a lesson to `progress`% (100 = finished), with
 * the points for the stretch just done (see progressPoints). A record never
 * goes down: reading back over earlier pages takes nothing away. Whatever is
 * recorded also ticks the «طلب العلم» tasks linked to the journey.
 */
async function recordLesson(item: LessonForRecord, userId: string, date: string, progress: number, extra: { page?: number }) {
  const key = { itemId: item.id, userId };
  const existing = await prisma.learningCompletion.findUnique({ where: { itemId_userId: key }, select: { points: true, progress: true, madeUp: true } });
  const keep = extra.page !== undefined ? { page: extra.page } : {};
  if (existing && existing.progress >= progress) {
    if (Object.keys(keep).length) await prisma.learningCompletion.update({ where: { itemId_userId: key }, data: keep });
    return { tasks: [] as string[] };
  }
  if (item.date > date) throw new HttpError(400, 'لم يحن وقت هذا الدرس بعد — تهيّأ له');
  const gained = progressPoints(item.points, item.date, date, existing?.progress ?? 0, progress);
  if (gained === null) throw new HttpError(400, `يمكن تدارك دروس آخر ${LEARN_MAKEUP_DAYS} أيام فقط`);
  const late = item.date !== date;
  const finishing = progress >= 100;
  const data = {
    progress,
    points: Math.min(item.points, (existing?.points ?? 0) + gained),
    doneAt: finishing ? new Date() : null,
    // «تدارك» describes when it was finished; part of a lesson keeps what it began as.
    madeUp: existing && !finishing ? existing.madeUp : late,
    ...keep,
  };
  // upsert keeps a double-tap from failing on the unique key.
  await prisma.learningCompletion.upsert({ where: { itemId_userId: key }, create: { ...key, day: item.date, ...data }, update: data });
  return { tasks: await tickLearningTasks(userId, date) };
}

/** What the member's card needs back after recording a lesson. */
async function recordState(item: LessonForRecord, userId: string, tasks: string[]) {
  const [row, dayItems, dayDone] = await Promise.all([
    prisma.learningCompletion.findUnique({ where: { itemId_userId: { itemId: item.id, userId } }, select: { points: true, madeUp: true, progress: true, page: true } }),
    prisma.learningItem.count({ where: { date: item.date } }),
    prisma.learningCompletion.count({ where: { userId, day: item.date, progress: 100 } }),
  ]);
  const progress = row?.progress ?? 0;
  return {
    id: item.id,
    done: progress >= 100,
    progress,
    page: row?.page ?? null,
    points: row?.points ?? 0,
    madeUp: row?.madeUp ?? false,
    // «أتممت درس اليوم»: every lesson of that day is finished.
    dayDone: dayDone >= dayItems,
    /** «طلب العلم» tasks ticked just now by this lesson. */
    tasks,
  };
}

const findLesson = async (id: string) => {
  const item = await prisma.learningItem.findUnique({ where: { id }, select: { id: true, date: true, points: true, startPage: true, endPage: true } });
  if (!item) throw new HttpError(404, 'الدرس غير موجود');
  return item;
};

/**
 * «أتممت الدرس»: on its day (or the next) for the full points, within the
 * week for half — the rest of them, if part was already recorded. A `note`
 * sent with it is added to «فوائدي». Unticking removes the record, part and
 * notes with it; a «طلب العلم» task it ticked stays ticked, for the member
 * did give that time to learning.
 */
router.put('/items/:id/done', requireAuth, validate(doneSchema), async (req, res, next) => {
  try {
    const { date, done, note } = req.body as z.infer<typeof doneSchema>;
    const userId = req.user!.id;
    await requireJoined(userId);
    const item = await findLesson(req.params.id);
    if (!done) {
      await prisma.learningCompletion.deleteMany({ where: { itemId: item.id, userId } });
      return res.json(await recordState(item, userId, []));
    }
    const { tasks } = await recordLesson(item, userId, date, 100, {});
    if (note) await addNote(item.id, userId, note);
    return res.json(await recordState(item, userId, tasks));
  } catch (err) {
    next(err);
  }
});

/**
 * «سجّل ما قرأت» / «أنجزت بعضه»: part of a lesson. From the reader it's the
 * page where the member stopped, measured against the lesson's pages; for a
 * lesson with no page range it's how much (ربعه / نصفه / أكثره). It earns that
 * share of the points, keeps «سلسلة العلم», and ticks the linked «طلب العلم»
 * task — but the lesson counts as finished only with «أتممت الدرس».
 */
router.put('/items/:id/progress', requireAuth, validate(progressSchema), async (req, res, next) => {
  try {
    const { date, page, progress } = req.body as z.infer<typeof progressSchema>;
    const userId = req.user!.id;
    await requireJoined(userId);
    const item = await findLesson(req.params.id);
    const fromPage = page === undefined ? null : pageProgress(item.startPage, item.endPage, page);
    if (fromPage === 0) throw new HttpError(400, `لم تبلغ صفحة الدرس بعد — يبدأ من صفحة ${item.startPage}`);
    const share = progress ?? fromPage;
    if (share === null || share === undefined) {
      // Nothing to measure by: keep only the place, if there's already a record.
      const kept = page !== undefined ? await prisma.learningCompletion.updateMany({ where: { itemId: item.id, userId }, data: { page } }) : { count: 0 };
      if (kept.count === 0) throw new HttpError(400, 'حدّد كم أنجزت من الدرس');
      return res.json(await recordState(item, userId, []));
    }
    const { tasks } = await recordLesson(item, userId, date, share, { page });
    return res.json(await recordState(item, userId, tasks));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- «فوائدي»

/**
 * Adds a فائدة to the member's record of a lesson. There must be a record —
 * the lesson finished or begun («أنجزت بعضه») — so a note always belongs to
 * learning the member actually did.
 */
async function addNote(itemId: string, userId: string, text: string) {
  const completion = await prisma.learningCompletion.findUnique({
    where: { itemId_userId: { itemId, userId } },
    select: { id: true, _count: { select: { notes: true } } },
  });
  if (!completion) throw new HttpError(404, 'ابدأ الدرس أولاً ثم اكتب فائدتك');
  if (completion._count.notes >= MAX_NOTES_PER_LESSON) {
    throw new HttpError(400, `بلغت ${MAX_NOTES_PER_LESSON} فائدة في هذا الدرس — اجمع بعضها في فائدة واحدة`);
  }
  return prisma.learningNote.create({ data: { completionId: completion.id, text }, select: NOTE_SELECT });
}

/** Only the member's own note on this lesson. */
const ownNote = (params: Record<string, string>, userId: string) => ({
  id: params.noteId,
  completion: { itemId: params.id, userId },
});

/** «أضف فائدة»: one more note on a lesson the member finished or began. Only they see it. */
router.post('/items/:id/notes', requireAuth, validate(noteSchema), async (req, res, next) => {
  try {
    const { text } = req.body as z.infer<typeof noteSchema>;
    return res.status(201).json({ note: await addNote(req.params.id, req.user!.id, text) });
  } catch (err) {
    next(err);
  }
});

router.put('/items/:id/notes/:noteId', requireAuth, validate(noteSchema), async (req, res, next) => {
  try {
    const { text } = req.body as z.infer<typeof noteSchema>;
    const { count } = await prisma.learningNote.updateMany({ where: ownNote(req.params, req.user!.id), data: { text } });
    if (count === 0) throw new HttpError(404, 'الفائدة غير موجودة');
    const note = await prisma.learningNote.findUnique({ where: { id: req.params.noteId }, select: NOTE_SELECT });
    return res.json({ note });
  } catch (err) {
    next(err);
  }
});

router.delete('/items/:id/notes/:noteId', requireAuth, async (req, res, next) => {
  try {
    const { count } = await prisma.learningNote.deleteMany({ where: ownNote(req.params, req.user!.id) });
    if (count === 0) throw new HttpError(404, 'الفائدة غير موجودة');
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * «رفقاء الرحلة», for every member: the brothers on the journey, how much of it
 * they've walked, their streak, and whether they've finished today's lessons.
 * Notes are never shared.
 */
router.get('/companions', requireAuth, validate(z.object({ date: anyDateSchema }), 'query'), async (req, res, next) => {
  try {
    const { date } = req.query as { date: string };
    const [enrolled, allItems, completions, excuses] = await Promise.all([
      prisma.learningEnrollment.findMany({
        where: { active: true },
        select: { startDay: true, user: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      prisma.learningItem.findMany({ select: { id: true, date: true } }),
      prisma.learningCompletion.findMany({ select: { userId: true, itemId: true, day: true, points: true, progress: true } }),
      prisma.taskExcuse.findMany({ select: { userId: true, day: true } }),
    ]);
    const lessonDays = allItems.map((i) => i.date);
    const weekStart = weekStartIso(date);
    const weekEnd = shiftDate(weekStart, 6);
    const todayIds = new Set(allItems.filter((i) => i.date === date).map((i) => i.id));
    const byUser = new Map<string, typeof completions>();
    for (const c of completions) (byUser.get(c.userId) ?? byUser.set(c.userId, []).get(c.userId)!).push(c);
    const excusedOf = new Map<string, Set<string>>();
    for (const e of excuses) (excusedOf.get(e.userId) ?? excusedOf.set(e.userId, new Set()).get(e.userId)!).add(e.day);

    const members = enrolled
      .map(({ startDay, user }) => {
        const mine = byUser.get(user.id) ?? [];
        // Lessons count when finished; points and the streak take part of one too.
        const ids = new Set(mine.filter((c) => c.progress >= 100).map((c) => c.itemId));
        const due = allItems.filter((i) => i.date <= date && (!startDay || i.date >= startDay));
        return {
          ...user,
          startDay,
          done: ids.size,
          due: due.length,
          keptDue: due.filter((i) => ids.has(i.id)).length,
          points: mine.reduce((n, c) => n + c.points, 0),
          /** Points in «طلب العلم» this Saturday → Friday week, as on «ساحة الهمّة». */
          week: mine.filter((c) => c.day >= weekStart && c.day <= weekEnd).reduce((n, c) => n + c.points, 0),
          todayDone: [...todayIds].filter((id) => ids.has(id)).length,
          ...learningStreak(lessonDays, new Set(mine.map((c) => c.day)), excusedOf.get(user.id) ?? new Set(), date, startDay),
        };
      })
      .sort((a, b) => b.done - a.done || b.streak - a.streak || a.name.localeCompare(b.name, 'ar'));
    return res.json({ date, total: allItems.length, todayCount: todayIds.size, members });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- managers

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((v) => v || null);

/**
 * The PDF attached to a lesson: what POST /files returned, sent back as is.
 * Only files this feature stored are accepted (our uploads folder or Cloudinary).
 */
const fileFields = {
  filePublicId: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || isLearningFileId(v), { message: 'الملف غير صالح' }),
  fileUrl: z
    .string()
    .max(2000)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || v.startsWith('/uploads/learning/') || v.startsWith('https://res.cloudinary.com/'), { message: 'الملف غير صالح' }),
  fileName: optionalText(200, 'اسم الملف طويل جداً'),
  fileBytes: z.number().int().min(0).nullish(),
  filePages: z.number().int().min(1).max(100000).nullish(),
  startPage: pageSchema.nullish(),
  endPage: pageSchema.nullish(),
};
/** A file comes with its address, or not at all. */
const fileComplete = (v: { filePublicId?: string | null; fileUrl?: string | null }) => Boolean(v.filePublicId) === Boolean(v.fileUrl);
/** «إلى صفحة» can't come before «من صفحة». */
const pagesInOrder = (v: { startPage?: number | null; endPage?: number | null }) => !v.startPage || !v.endPage || v.endPage >= v.startPage;

const lessonDate = anyDateSchema.refine((v) => !isRestDay(v), { message: 'يوم الجمعة يوم استجمام — لا دروس فيه' });

const itemFields = {
  date: lessonDate,
  kind: z.enum(['reading', 'video', 'audio', 'article', 'practice'], { message: 'نوع الدرس غير صالح' }),
  title: z.string().trim().min(1, 'عنوان الدرس مطلوب').max(200, 'العنوان طويل جداً'),
  source: optionalText(200, 'اسم الكتاب أو الشيخ طويل جداً'),
  portion: optionalText(200, 'المقدار طويل جداً'),
  description: optionalText(2000, 'الوصف طويل جداً'),
  linkUrl: linkUrlSchema,
  ...fileFields,
  minutes: z.number().int().min(1, 'المدة غير صالحة').max(600, 'المدة طويلة جداً').nullish(),
  points: z.number().int().min(1, 'أقل النقاط ١').max(100, 'أكثر النقاط ١٠٠').optional(),
  order: z.number().int().min(0).max(100000).optional(),
};
const pagesMessage = { message: 'صفحة النهاية قبل صفحة البداية', path: ['endPage'] };
const createSchema = z.object(itemFields).refine(fileComplete, { message: 'الملف غير صالح' }).refine(pagesInOrder, pagesMessage);
const updateSchema = z.object(itemFields).partial().refine(fileComplete, { message: 'الملف غير صالح' }).refine(pagesInOrder, pagesMessage);
const bulkSchema = z.object({
  items: z.array(createSchema).min(1, 'لا دروس في الخطة').max(MAX_BULK_ITEMS, `أكثر الخطة ${MAX_BULK_ITEMS} درسًا`),
});

/** The calendar from `from` to `to`, with how many members finished each lesson. */
router.get('/manage', ...manage, validate(z.object({ from: anyDateSchema, to: anyDateSchema }), 'query'), async (req, res, next) => {
  try {
    const { from, to } = req.query as { from: string; to: string };
    if (from > to || daysBetween(from, to) > MAX_RANGE_DAYS) throw new HttpError(400, 'المدة المطلوبة طويلة');
    const [items, members] = await Promise.all([
      prisma.learningItem.findMany({ where: { date: { gte: from, lte: to } }, orderBy: ORDER, select: ITEM_SELECT }),
      prisma.learningEnrollment.count({ where: { active: true } }),
    ]);
    const counts = items.length
      ? await prisma.learningCompletion.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) }, progress: 100 }, _count: { _all: true } })
      : [];
    const countOf = new Map(counts.map((c) => [c.itemId, c._count._all]));
    return res.json({ members, items: items.map((i) => ({ ...i, doneCount: countOf.get(i.id) ?? 0 })) });
  } catch (err) {
    next(err);
  }
});

/** The next place on a day, after its last lesson. */
async function nextOrder(date: string) {
  const last = await prisma.learningItem.aggregate({ where: { date }, _max: { order: true } });
  return (last._max.order ?? -1) + 1;
}

router.post('/items', ...manage, validate(createSchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof createSchema>;
    const item = await prisma.learningItem.create({
      data: { ...data, order: data.order ?? (await nextOrder(data.date)), createdById: req.user!.id },
      select: ITEM_SELECT,
    });
    return res.status(201).json({ item: { ...item, doneCount: 0 } });
  } catch (err) {
    next(err);
  }
});

/** «خطة كتاب»: many lessons at once (a book laid out over the coming weeks), each after its day's others. */
router.post('/items/bulk', ...manage, validate(bulkSchema), async (req, res, next) => {
  try {
    const { items } = req.body as z.infer<typeof bulkSchema>;
    const dates = [...new Set(items.map((i) => i.date))];
    const last = await prisma.learningItem.groupBy({ by: ['date'], where: { date: { in: dates } }, _max: { order: true } });
    const nextOf = new Map(last.map((l) => [l.date, (l._max.order ?? -1) + 1]));
    const createdById = req.user!.id;
    const created = await prisma.$transaction(
      items.map((i) => {
        const order = i.order ?? nextOf.get(i.date) ?? 0;
        nextOf.set(i.date, order + 1);
        return prisma.learningItem.create({ data: { ...i, order, createdById }, select: ITEM_SELECT });
      }),
    );
    return res.status(201).json({ items: created.map((i) => ({ ...i, doneCount: 0 })) });
  } catch (err) {
    next(err);
  }
});

/**
 * Edit a lesson. Moving it to another day keeps who finished it, counted for
 * the new day.
 */
router.put('/items/:id', ...manage, validate(updateSchema), async (req, res, next) => {
  try {
    const patch = req.body as z.infer<typeof updateSchema>;
    const existing = await prisma.learningItem.findUnique({ where: { id: req.params.id }, select: { id: true, date: true, filePublicId: true } });
    if (!existing) throw new HttpError(404, 'الدرس غير موجود');
    if (patch.filePublicId === undefined) {
      // A patch that doesn't mention the file leaves it alone, address and all.
      for (const k of ['fileUrl', 'fileName', 'fileBytes', 'filePages'] as const) delete patch[k];
    } else if (!patch.filePublicId) {
      Object.assign(patch, { fileUrl: null, fileName: null, fileBytes: null, filePages: null, startPage: null, endPage: null });
    }
    const [item] = await prisma.$transaction([
      prisma.learningItem.update({ where: { id: existing.id }, data: patch, select: ITEM_SELECT }),
      ...(patch.date && patch.date !== existing.date
        ? [prisma.learningCompletion.updateMany({ where: { itemId: existing.id }, data: { day: patch.date } })]
        : []),
    ]);
    if (existing.filePublicId && existing.filePublicId !== item.filePublicId) await removeIfUnused(existing.filePublicId);
    const doneCount = await prisma.learningCompletion.count({ where: { itemId: existing.id, progress: 100 } });
    return res.json({ item: { ...item, doneCount } });
  } catch (err) {
    next(err);
  }
});

/** Deletes the lesson, and with it the members' ticks and notes on it. */
router.delete('/items/:id', ...manage, async (req, res, next) => {
  try {
    const item = await prisma.learningItem.findUnique({ where: { id: req.params.id }, select: { filePublicId: true } });
    const { count } = await prisma.learningItem.deleteMany({ where: { id: req.params.id } });
    if (count === 0) throw new HttpError(404, 'الدرس غير موجود');
    if (item?.filePublicId) await removeIfUnused(item.filePublicId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- files

/** Deletes a stored PDF once no lesson uses it (a «خطة كتاب» shares one file). Never throws. */
async function removeIfUnused(publicId: string) {
  const used = await prisma.learningItem.count({ where: { filePublicId: publicId } });
  if (used === 0) await learningFileStore.remove(publicId).catch(() => undefined);
}

const MAX_MB = env.LEARNING_FILE_MAX_MB;
const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LEARNING_FILE_BYTES, files: 1 } }).single('file');
/** multer's own errors speak of images; these are about a book. */
const receivePdf: RequestHandler = (req, res, next) =>
  pdfUpload(req, res, (err: unknown) => {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `حجم الملف يتجاوز ${MAX_MB} ميغابايت — قسّمه أو ضع رابطه بدلًا منه`));
    if (code) return next(new HttpError(400, 'أرسل ملفًا واحدًا بصيغة PDF'));
    next(err as Error | undefined);
  });

/**
 * «إرفاق ملف PDF»: stores the file and returns what the lesson keeps of it.
 * It's attached when the lesson is saved; one never saved is thrown away by
 * DELETE /files/:publicId.
 */
router.post('/files', ...manage, receivePdf, async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) throw new HttpError(400, 'اختر ملف PDF');
    if (!isPdf(file.buffer)) throw new HttpError(400, 'الملف ليس PDF — حوّله إلى PDF ثم ارفعه');
    const stored = await learningFileStore.upload(file.buffer);
    // Browsers send the name as latin1 bytes; Arabic names need decoding.
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 200);
    return res.status(201).json({ file: { publicId: stored.publicId, url: stored.url, name, bytes: file.size, pages: stored.pages } });
  } catch (err) {
    next(err);
  }
});

/** Throw away an uploaded PDF that no lesson took (the form was cancelled or the file replaced). */
router.delete('/files/:publicId(*)', ...manage, async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!isLearningFileId(publicId)) throw new HttpError(400, 'الملف غير صالح');
    await removeIfUnused(publicId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

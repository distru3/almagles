import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireScheduleManager } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { linkUrlSchema } from '../lib/linkUrl.js';
import { parseDate, shiftDate } from '../lib/taskSchedule.js';
import { LEARN_MAKEUP_DAYS, isRestDay, learningPoints, learningStreak } from '../lib/learning.js';
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
  minutes: true,
  points: true,
  order: true,
} as const;
const ORDER = [{ date: 'asc' as const }, { order: 'asc' as const }, { createdAt: 'asc' as const }];

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
 * coming fortnight) with their own ticks and notes and how many members
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
      prisma.learningCompletion.findMany({ where: { userId }, select: { itemId: true, day: true, points: true, madeUp: true, note: true } }),
      prisma.taskExcuse.findMany({ where: { userId }, select: { day: true } }),
      prisma.learningEnrollment.count({ where: { active: true } }),
    ]);
    const counts = items.length
      ? await prisma.learningCompletion.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) } }, _count: { _all: true } })
      : [];
    const countOf = new Map(counts.map((c) => [c.itemId, c._count._all]));
    const doneOf = new Map(mine.map((c) => [c.itemId, c]));

    const startDay = enrollment?.startDay ?? null;
    const due = allItems.filter((i) => i.date <= today && (!startDay || i.date >= startDay));
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
        return {
          ...i,
          done: Boolean(c),
          madeUp: c?.madeUp ?? false,
          earned: c?.points ?? 0,
          note: c?.note ?? null,
          doneCount: countOf.get(i.id) ?? 0,
          /** What finishing it now would earn; null when it can't be ticked today. */
          worth: c ? null : learningPoints(i.points, i.date, today),
        };
      }),
      stats: {
        done: mine.length,
        total: allItems.length,
        due: due.length,
        keptDue: due.filter((i) => doneOf.has(i.id)).length,
        points: mine.reduce((n, c) => n + c.points, 0),
        madeUp: mine.filter((c) => c.madeUp).length,
        notes: mine.filter((c) => c.note).length,
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

const noteSchema = z
  .string()
  .trim()
  .max(1000, 'الفائدة طويلة — اختصرها في سطور')
  .nullish()
  .transform((v) => v || null);
const doneSchema = z.object({ date: todaySchema, done: z.boolean(), note: noteSchema.optional() });

/**
 * «أتممت الدرس»: on its day (or the next) for the full points, within the
 * week for half. Unticking removes it and its note.
 */
router.put('/items/:id/done', requireAuth, validate(doneSchema), async (req, res, next) => {
  try {
    const { date, done, note } = req.body as z.infer<typeof doneSchema>;
    const userId = req.user!.id;
    await requireJoined(userId);
    const item = await prisma.learningItem.findUnique({ where: { id: req.params.id }, select: { id: true, date: true, points: true } });
    if (!item) throw new HttpError(404, 'الدرس غير موجود');
    const key = { itemId: item.id, userId };
    if (!done) {
      await prisma.learningCompletion.deleteMany({ where: key });
      return res.json({ id: item.id, done, points: 0, madeUp: false, dayDone: false });
    }
    const existing = await prisma.learningCompletion.findUnique({ where: { itemId_userId: key }, select: { points: true, madeUp: true } });
    if (!existing) {
      if (item.date > date) throw new HttpError(400, 'لم يحن وقت هذا الدرس بعد — تهيّأ له');
      const points = learningPoints(item.points, item.date, date);
      if (points === null) throw new HttpError(400, `يمكن تدارك دروس آخر ${LEARN_MAKEUP_DAYS} أيام فقط`);
      // upsert keeps a double-tap from failing on the unique key.
      await prisma.learningCompletion.upsert({
        where: { itemId_userId: key },
        create: { ...key, day: item.date, points, madeUp: item.date !== date, note: note ?? null },
        update: {},
      });
    } else if (note !== undefined) {
      await prisma.learningCompletion.update({ where: { itemId_userId: key }, data: { note } });
    }
    const row = (await prisma.learningCompletion.findUnique({ where: { itemId_userId: key }, select: { points: true, madeUp: true } }))!;
    // «أتممت درس اليوم»: every lesson of that day is done.
    const [dayItems, dayDone] = await Promise.all([
      prisma.learningItem.count({ where: { date: item.date } }),
      prisma.learningCompletion.count({ where: { userId, day: item.date } }),
    ]);
    return res.json({ id: item.id, done, points: row.points, madeUp: row.madeUp, dayDone: dayDone >= dayItems });
  } catch (err) {
    next(err);
  }
});

/** «فائدتي»: change the note on a lesson already done. */
router.put('/items/:id/note', requireAuth, validate(z.object({ note: noteSchema })), async (req, res, next) => {
  try {
    const { note } = req.body as { note: string | null };
    const { count } = await prisma.learningCompletion.updateMany({ where: { itemId: req.params.id, userId: req.user!.id }, data: { note } });
    if (count === 0) throw new HttpError(404, 'أتمّ الدرس أولاً ثم اكتب فائدتك');
    return res.json({ id: req.params.id, note });
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
      prisma.learningCompletion.findMany({ select: { userId: true, itemId: true, day: true, points: true } }),
      prisma.taskExcuse.findMany({ select: { userId: true, day: true } }),
    ]);
    const lessonDays = allItems.map((i) => i.date);
    const todayIds = new Set(allItems.filter((i) => i.date === date).map((i) => i.id));
    const byUser = new Map<string, typeof completions>();
    for (const c of completions) (byUser.get(c.userId) ?? byUser.set(c.userId, []).get(c.userId)!).push(c);
    const excusedOf = new Map<string, Set<string>>();
    for (const e of excuses) (excusedOf.get(e.userId) ?? excusedOf.set(e.userId, new Set()).get(e.userId)!).add(e.day);

    const members = enrolled
      .map(({ startDay, user }) => {
        const mine = byUser.get(user.id) ?? [];
        const ids = new Set(mine.map((c) => c.itemId));
        const due = allItems.filter((i) => i.date <= date && (!startDay || i.date >= startDay));
        return {
          ...user,
          startDay,
          done: mine.length,
          due: due.length,
          keptDue: due.filter((i) => ids.has(i.id)).length,
          points: mine.reduce((n, c) => n + c.points, 0),
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
  startPage: z.number().int().min(1, 'رقم الصفحة غير صالح').max(100000, 'رقم الصفحة غير صالح').nullish(),
};
/** A file comes with its address, or not at all. */
const fileComplete = (v: { filePublicId?: string | null; fileUrl?: string | null }) => Boolean(v.filePublicId) === Boolean(v.fileUrl);

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
const createSchema = z.object(itemFields).refine(fileComplete, { message: 'الملف غير صالح' });
const updateSchema = z.object(itemFields).partial().refine(fileComplete, { message: 'الملف غير صالح' });
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
      ? await prisma.learningCompletion.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) } }, _count: { _all: true } })
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
      Object.assign(patch, { fileUrl: null, fileName: null, fileBytes: null, filePages: null, startPage: null });
    }
    const [item] = await prisma.$transaction([
      prisma.learningItem.update({ where: { id: existing.id }, data: patch, select: ITEM_SELECT }),
      ...(patch.date && patch.date !== existing.date
        ? [prisma.learningCompletion.updateMany({ where: { itemId: existing.id }, data: { day: patch.date } })]
        : []),
    ]);
    if (existing.filePublicId && existing.filePublicId !== item.filePublicId) await removeIfUnused(existing.filePublicId);
    const doneCount = await prisma.learningCompletion.count({ where: { itemId: existing.id } });
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

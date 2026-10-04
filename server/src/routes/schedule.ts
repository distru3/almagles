import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireScheduleManager } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';

const router = Router();
const manage = [requireAuth, requireScheduleManager];

/** getUTCDay() order. Weeks run Saturday → Friday. */
const WEEKDAY_BY_UTC_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function parseDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  // Rejects calendar-invalid dates like 2026-02-30, which Date would roll over.
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d;
}

const isoDate = (message: string) => z.string().refine((v) => parseDate(v) !== null, { message });

function weekdayKeyOf(iso: string): string {
  return WEEKDAY_BY_UTC_DAY[parseDate(iso)!.getUTCDay()];
}

function addDaysIso(iso: string, days: number): string {
  const d = parseDate(iso)!;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Saturday that starts the week containing `iso`. */
function weekStartIso(iso: string): string {
  return addDaysIso(iso, -((parseDate(iso)!.getUTCDay() + 1) % 7));
}

/** `//host` and `/\host` start with a slash but resolve to another site. */
function isInternalPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
}

const linkUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((val) => {
    if (!val) return null;
    if (isInternalPath(val) || /^https?:\/\//i.test(val)) return val;
    return `https://${val.replace(/^[/\\]+/, '')}`;
  })
  .refine(
    (val) => {
      if (!val || isInternalPath(val)) return true;
      try {
        const u = new URL(val);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'الرابط غير صالح' },
  );

/** Values for custom columns; empty values are dropped so rows stay small. */
const customValuesSchema = z
  .record(z.string().min(1).max(64), z.string().trim().max(500))
  .refine((v) => Object.keys(v).length <= 30, { message: 'عدد الأعمدة المخصصة كبير جداً' })
  .transform((v) => Object.fromEntries(Object.entries(v).filter(([, value]) => value !== '')));

const itemFields = {
  date: isoDate('تاريخ غير صالح'),
  timeLabel: z.string().trim().max(50).default(''),
  section: z.string().trim().max(100).nullish(),
  title: z.string().trim().min(1, 'العنوان مطلوب').max(200),
  notes: z.string().trim().max(2000).nullish(),
  linkUrl: linkUrlSchema,
  linkLabel: z.string().trim().max(100).nullish(),
  customValues: customValuesSchema.optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
};
const createSchema = z.object(itemFields);
const updateSchema = z.object(itemFields).partial();
type CreateInput = z.infer<typeof createSchema>;

async function nextSortOrder(date: string): Promise<number> {
  const last = await prisma.scheduleItem.findFirst({
    where: { date },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

async function createItem(data: CreateInput) {
  return prisma.scheduleItem.create({
    data: {
      ...data,
      // Derived from the date so the two can never disagree.
      weekdayKey: weekdayKeyOf(data.date),
      customValues: data.customValues ?? {},
      sortOrder: data.sortOrder ?? (await nextSortOrder(data.date)),
    },
  });
}

const ORDER = [{ date: 'asc' as const }, { sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

// ---------------------------------------------------------------- reading

const listQuerySchema = z.object({
  from: isoDate('تاريخ البداية غير صالح').optional(),
  to: isoDate('تاريخ النهاية غير صالح').optional(),
});

router.get('/', validate(listQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { from, to } = req.query as unknown as z.infer<typeof listQuerySchema>;
    const where = from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
    const [items, columns] = await Promise.all([
      prisma.scheduleItem.findMany({ where, orderBy: ORDER }),
      prisma.scheduleColumn.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    return res.json({ items, columns });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- sessions

router.post('/', ...manage, validate(createSchema), async (req, res, next) => {
  try {
    const item = await createItem(req.body as CreateInput);
    return res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

const bulkSchema = z.object({ items: z.array(createSchema).min(1).max(500) });

/** Create many sessions at once (CSV import, restoring a deleted week). */
router.post('/bulk', ...manage, validate(bulkSchema), async (req, res, next) => {
  try {
    const { items } = req.body as z.infer<typeof bulkSchema>;
    const created = await prisma.$transaction(async (tx) => {
      const out = [];
      const nextOrder = new Map<string, number>();
      for (const data of items) {
        if (!nextOrder.has(data.date)) {
          const last = await tx.scheduleItem.findFirst({
            where: { date: data.date },
            orderBy: { sortOrder: 'desc' },
            select: { sortOrder: true },
          });
          nextOrder.set(data.date, (last?.sortOrder ?? -1) + 1);
        }
        const order = data.sortOrder ?? nextOrder.get(data.date)!;
        nextOrder.set(data.date, Math.max(nextOrder.get(data.date)!, order + 1));
        out.push(
          await tx.scheduleItem.create({
            data: { ...data, weekdayKey: weekdayKeyOf(data.date), customValues: data.customValues ?? {}, sortOrder: order },
          }),
        );
      }
      return out;
    });
    return res.status(201).json({ items: created });
  } catch (err) {
    next(err);
  }
});

const copyWeekSchema = z.object({
  to: isoDate('تاريخ الأسبوع غير صالح'),
  from: isoDate('تاريخ الأسبوع غير صالح').optional(),
});

/**
 * Copy a week's sessions onto the same weekdays of another week. Without
 * `from`, uses the closest earlier week that has sessions. Notes are left
 * empty, as in the original schedule app — they are specific to each day.
 */
router.post('/copy-week', ...manage, validate(copyWeekSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof copyWeekSchema>;
    const to = weekStartIso(body.to);
    let from = body.from ? weekStartIso(body.from) : null;
    if (!from) {
      const prev = await prisma.scheduleItem.findFirst({
        where: { date: { lt: to } },
        orderBy: { date: 'desc' },
        select: { date: true },
      });
      if (!prev) throw new HttpError(404, 'لا يوجد أسبوع سابق لنسخه');
      from = weekStartIso(prev.date);
    }
    if (from === to) throw new HttpError(400, 'لا يمكن نسخ الأسبوع إلى نفسه');

    const source = await prisma.scheduleItem.findMany({
      where: { date: { gte: from, lte: addDaysIso(from, 6) } },
      orderBy: ORDER,
    });
    if (source.length === 0) throw new HttpError(404, 'الأسبوع المصدر لا يحتوي على جلسات');

    const offset = Math.round((parseDate(to)!.getTime() - parseDate(from)!.getTime()) / 86_400_000);
    const created = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const s of source) {
        const date = addDaysIso(s.date, offset);
        out.push(
          await tx.scheduleItem.create({
            data: {
              date,
              weekdayKey: s.weekdayKey,
              timeLabel: s.timeLabel,
              section: s.section,
              title: s.title,
              notes: null,
              linkUrl: s.linkUrl,
              linkLabel: s.linkLabel,
              customValues: s.customValues ?? {},
              sortOrder: s.sortOrder,
            },
          }),
        );
      }
      return out;
    });
    return res.status(201).json({ from, to, items: created });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', ...manage, validate(updateSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.scheduleItem.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'العنصر غير موجود' });

    const data = req.body as z.infer<typeof updateSchema>;
    const moved = data.date !== undefined && data.date !== existing.date;
    const item = await prisma.scheduleItem.update({
      where: { id },
      data: {
        ...data,
        ...(data.date !== undefined ? { weekdayKey: weekdayKeyOf(data.date) } : {}),
        // Moving to another day appends to that day unless an order was given.
        ...(moved && data.sortOrder === undefined ? { sortOrder: await nextSortOrder(data.date!) } : {}),
      },
    });
    return res.json({ item });
  } catch (err) {
    next(err);
  }
});

router.delete('/week/:start', ...manage, async (req, res, next) => {
  try {
    if (!parseDate(req.params.start)) throw new HttpError(400, 'تاريخ الأسبوع غير صالح');
    const start = weekStartIso(req.params.start);
    const { count } = await prisma.scheduleItem.deleteMany({
      where: { date: { gte: start, lte: addDaysIso(start, 6) } },
    });
    return res.json({ ok: true, deleted: count });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', ...manage, async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.scheduleItem.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'العنصر غير موجود' });
    await prisma.scheduleItem.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- custom columns

const columnSchema = z.object({
  label: z.string().trim().min(1, 'اسم العمود مطلوب').max(40, 'اسم العمود طويل جداً'),
  order: z.number().int().min(0).max(1000).optional(),
});

router.post('/columns', ...manage, validate(columnSchema), async (req, res, next) => {
  try {
    const { label, order } = req.body as z.infer<typeof columnSchema>;
    const count = await prisma.scheduleColumn.count();
    if (count >= 30) throw new HttpError(400, 'عدد الأعمدة المخصصة كبير جداً');
    const column = await prisma.scheduleColumn.create({ data: { label, order: order ?? count } });
    return res.status(201).json({ column });
  } catch (err) {
    next(err);
  }
});

router.put('/columns/:id', ...manage, validate(columnSchema.partial()), async (req, res, next) => {
  try {
    const column = await prisma.scheduleColumn.update({ where: { id: req.params.id }, data: req.body });
    return res.json({ column });
  } catch (err) {
    next(err);
  }
});

router.delete('/columns/:id', ...manage, async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.$transaction([
      prisma.scheduleColumn.delete({ where: { id } }),
      // Drop the column's values from every session that has one.
      prisma.$executeRaw`UPDATE "ScheduleItem" SET "customValues" = "customValues" - ${id}::text WHERE "customValues" ->> ${id}::text IS NOT NULL`,
    ]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

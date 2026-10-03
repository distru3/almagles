import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireScheduleManager } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const WEEKDAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
const WEEKDAYS_ENUM = z.enum(WEEKDAYS, { errorMap: () => ({ message: 'اليوم غير صالح' }) });
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const listQuerySchema = z.object({
  from: z.string().regex(DATE_REGEX, 'تاريخ البداية غير صالح').optional(),
  to: z.string().regex(DATE_REGEX, 'تاريخ النهاية غير صالح').optional(),
});

router.get('/', validate(listQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { from, to } = req.query as unknown as z.infer<typeof listQuerySchema>;
    const where: any = {};
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }
    const items = await prisma.scheduleItem.findMany({
      where,
      orderBy: [{ date: 'asc' }, { weekdayKey: 'asc' }],
    });
    return res.json({ items });
  } catch (err) {
    next(err);
  }
});

/** `//host` and `/\host` start with a slash but resolve to another site. */
function isInternalPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
}

const linkUrlSchema = z
  .string()
  .trim()
  .nullish()
  .transform((val) => {
    if (!val) return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (isInternalPath(trimmed) || /^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed.replace(/^[/\\]+/, '')}`;
  })
  .refine(
    (val) => {
      if (!val) return true;
      if (isInternalPath(val)) return true;
      try {
        const u = new URL(val);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'الرابط غير صالح' }
  );

const createSchema = z.object({
  date: z.string().regex(DATE_REGEX, 'تاريخ غير صالح'),
  weekdayKey: WEEKDAYS_ENUM,
  timeLabel: z.string().trim().min(1, 'الوقت مطلوب').max(50),
  section: z.string().trim().max(100).nullish(),
  title: z.string().trim().min(1, 'العنوان مطلوب').max(200),
  notes: z.string().trim().max(2000).nullish(),
  linkUrl: linkUrlSchema,
});

router.post('/', requireAuth, requireScheduleManager, validate(createSchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof createSchema>;
    const item = await prisma.scheduleItem.create({ data });
    return res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

const updateSchema = createSchema.partial();

router.put('/:id', requireAuth, requireScheduleManager, validate(updateSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.scheduleItem.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'العنصر غير موجود' });

    const data = req.body as z.infer<typeof updateSchema>;
    const item = await prisma.scheduleItem.update({ where: { id }, data });
    return res.json({ item });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requireScheduleManager, async (req, res, next) => {
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

export default router;
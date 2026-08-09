import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const WEEKDAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
const WEEKDAYS_ENUM = z.enum(WEEKDAYS, { errorMap: () => ({ message: 'اليوم غير صالح' }) });
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', async (_req, res, next) => {
  try {
    const items = await prisma.scheduleItem.findMany({
      orderBy: [{ date: 'asc' }, { weekdayKey: 'asc' }],
    });
    return res.json({ items });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  date: z.string().regex(DATE_REGEX, 'تاريخ غير صالح'),
  weekdayKey: WEEKDAYS_ENUM,
  timeLabel: z.string().trim().min(1, 'الوقت مطلوب').max(50),
  section: z.string().trim().max(100).nullish(),
  title: z.string().trim().min(1, 'العنوان مطلوب').max(200),
  notes: z.string().trim().max(2000).nullish(),
  linkUrl: z.string().trim().url('الرابط غير صالح').max(500).nullish(),
});

router.post('/', requireAdmin, validate(createSchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof createSchema>;
    const item = await prisma.scheduleItem.create({ data });
    return res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

const updateSchema = createSchema.partial();

router.put('/:id', requireAdmin, validate(updateSchema), async (req, res, next) => {
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

router.delete('/:id', requireAdmin, async (req, res, next) => {
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
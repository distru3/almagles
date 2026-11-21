import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { isAyah, pageOf } from '../lib/quran.js';

/**
 * «علاماتي» in «المصحف»: each member's places in the mushaf — one mark each
 * for «تلاوة», «حفظ», «مراجعة» and «تدبّر», moved forward as they go, and
 * marks of their own with a name they choose. The mushaf itself is static
 * files; only the marks live here.
 */
const router = Router();

/** Named marks a member can keep, besides the four built-ins. */
export const MAX_CUSTOM_MARKS = 20;

const BUILT_IN = ['tilawa', 'hifz', 'muraja', 'tadabbur'] as const;

const MARK_SELECT = { id: true, kind: true, label: true, sura: true, aya: true, page: true, updatedAt: true } as const;

const place = z
  .object({
    sura: z.number({ message: 'السورة غير صالحة' }).int().min(1).max(114, 'السورة غير صالحة'),
    aya: z.number({ message: 'الآية غير صالحة' }).int().min(1, 'الآية غير صالحة'),
  })
  .refine((p) => isAyah(p.sura, p.aya), { message: 'لا توجد هذه الآية في السورة', path: ['aya'] });

const label = z.string().trim().min(1, 'اكتب اسمًا للعلامة').max(40, 'اسم العلامة طويل');

router.get('/bookmarks', requireAuth, async (req, res, next) => {
  try {
    const marks = await prisma.quranBookmark.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }],
      select: MARK_SELECT,
    });
    return res.json({ marks });
  } catch (err) {
    next(err);
  }
});

/** Sets «تلاوة» / «حفظ» / «مراجعة» / «تدبّر» to an ayah — there's one of each, so it moves. */
router.put('/bookmarks/:kind', requireAuth, validate(place), async (req, res, next) => {
  try {
    const kind = req.params.kind as (typeof BUILT_IN)[number];
    if (!BUILT_IN.includes(kind)) throw new HttpError(404, 'نوع العلامة غير معروف');
    const { sura, aya } = req.body as z.infer<typeof place>;
    const userId = req.user!.id;
    const data = { sura, aya, page: pageOf(sura, aya) };
    const mark = await prisma.quranBookmark.upsert({
      where: { userId_slot: { userId, slot: kind } },
      update: data,
      create: { ...data, userId, kind, slot: kind },
      select: MARK_SELECT,
    });
    return res.json({ mark });
  } catch (err) {
    next(err);
  }
});

const customSchema = place.and(z.object({ label }));

/** A mark of the member's own, with its name («ورد الفجر»). */
router.post('/bookmarks', requireAuth, validate(customSchema), async (req, res, next) => {
  try {
    const { sura, aya, label: name } = req.body as z.infer<typeof customSchema>;
    const userId = req.user!.id;
    const count = await prisma.quranBookmark.count({ where: { userId, kind: 'custom' } });
    if (count >= MAX_CUSTOM_MARKS) throw new HttpError(400, `لك ${MAX_CUSTOM_MARKS} علامة خاصة على الأكثر — احذف واحدة أو انقلها`);
    const mark = await prisma.quranBookmark.create({
      data: { userId, kind: 'custom', slot: `custom:${randomUUID()}`, label: name, sura, aya, page: pageOf(sura, aya) },
      select: MARK_SELECT,
    });
    return res.status(201).json({ mark });
  } catch (err) {
    next(err);
  }
});

const customUpdate = z
  .object({ label: label.optional(), sura: z.number().int().optional(), aya: z.number().int().optional() })
  .refine((p) => (p.sura === undefined) === (p.aya === undefined), { message: 'حدّد السورة والآية معًا', path: ['aya'] })
  .refine((p) => p.sura === undefined || isAyah(p.sura, p.aya!), { message: 'لا توجد هذه الآية في السورة', path: ['aya'] });

/** Renames or moves one of the member's own marks. */
router.patch('/bookmarks/custom/:id', requireAuth, validate(customUpdate), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof customUpdate>;
    const existing = await prisma.quranBookmark.findFirst({ where: { id: req.params.id, userId: req.user!.id, kind: 'custom' }, select: { id: true } });
    if (!existing) throw new HttpError(404, 'العلامة غير موجودة');
    const mark = await prisma.quranBookmark.update({
      where: { id: existing.id },
      data: {
        ...(body.label !== undefined && { label: body.label }),
        ...(body.sura !== undefined && { sura: body.sura, aya: body.aya!, page: pageOf(body.sura, body.aya!) }),
      },
      select: MARK_SELECT,
    });
    return res.json({ mark });
  } catch (err) {
    next(err);
  }
});

/** Removes one of the member's marks (any kind). */
router.delete('/bookmarks/:id', requireAuth, async (req, res, next) => {
  try {
    const { count } = await prisma.quranBookmark.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (count === 0) throw new HttpError(404, 'العلامة غير موجودة');
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

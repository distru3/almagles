import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { validate } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

function slugifyArabic(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\u0600-\u06FFa-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function uniqueSlug(base: string): Promise<string> {
  const slug = base || 'قسم';
  let candidate = slug;
  let i = 2;
  while (await prisma.category.findUnique({ where: { slug: candidate } })) {
    candidate = `${slug}-${i}`;
    i += 1;
  }
  return candidate;
}

router.get('/', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { posts: true } } },
    });
    return res.json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        order: c.order,
        postCount: c._count.posts,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'اسم القسم قصير جداً').max(50, 'اسم القسم طويل جداً'),
  order: z.number().int().min(0).optional(),
});

router.post('/', requireAdmin, validate(createSchema), async (req, res, next) => {
  try {
    const { name, order } = req.body as z.infer<typeof createSchema>;
    const slug = await uniqueSlug(slugifyArabic(name));
    const category = await prisma.category.create({ data: { name, slug, order: order ?? 0 } });
    return res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  name: z.string().trim().min(2, 'اسم القسم قصير جداً').max(50, 'اسم القسم طويل جداً').optional(),
  order: z.number().int().min(0).optional(),
});

router.put('/:id', requireAdmin, validate(updateSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, order } = req.body as z.infer<typeof updateSchema>;

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'القسم غير موجود' });

    const data: { name?: string; order?: number; slug?: string } = {};
    if (name !== undefined) data.name = name;
    if (order !== undefined) data.order = order;
    if (name !== undefined && name !== existing.name) {
      data.slug = await uniqueSlug(slugifyArabic(name));
    }

    const category = await prisma.category.update({ where: { id }, data });
    return res.json({ category });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'القسم غير موجود' });
    await prisma.category.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
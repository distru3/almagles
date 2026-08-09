import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

const REACTION_TYPES = ['👍', '❤️', '💗', '😮', '😢'];

const reactSchema = z.object({
  type: z.enum(['👍', '❤️', '💗', '😮', '😢']),
});

router.get('/', async (req, res, next) => {
  try {
    const postId = (req.params as { postId?: string }).postId ?? '';
    const reactions = await prisma.reaction.findMany({
      where: { postId },
      select: { type: true },
    });
    const counts: Record<string, number> = {};
    for (const r of reactions) counts[r.type] = (counts[r.type] ?? 0) + 1;
    return res.json({ counts });
  } catch (err) {
    next(err);
  }
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    const postId = (req.params as { postId?: string }).postId ?? '';
    const parsed = reactSchema.safeParse(req.body);
    if (!parsed.success || !postId) {
      return res.status(400).json({ message: 'نوع التفاعل غير مدعوم' });
    }
    const { type } = parsed.data;

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return res.status(404).json({ message: 'المنشور غير موجود' });

    const existing = await prisma.reaction.findUnique({
      where: { postId_userId: { postId, userId: req.user!.id } },
    });

    if (existing && existing.type === type) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      return res.json({ removed: true, type });
    }

    if (existing) {
      const updated = await prisma.reaction.update({
        where: { id: existing.id },
        data: { type },
      });
      return res.json({ removed: false, type: updated.type });
    }

    const created = await prisma.reaction.create({
      data: { postId, userId: req.user!.id, type },
    });
    return res.status(201).json({ removed: false, type: created.type });
  } catch (err) {
    next(err);
  }
});

export default router;
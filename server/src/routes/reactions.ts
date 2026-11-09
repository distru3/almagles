import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyReaction } from '../lib/notifications.js';
import { validate } from '../middleware/validate.js';
import { CANONICAL_REACTIONS, postReactors, reactorsQuery, type ReactorsQuery } from '../lib/reactors.js';

export { CANONICAL_REACTIONS };

const router = Router({ mergeParams: true });

const VALID_TYPES = ['like', 'love', 'insight', '👍', '❤️', '💗', '😮', '😢'] as const;

const reactSchema = z.object({
  type: z.enum(VALID_TYPES),
});

router.get('/', async (req, res, next) => {
  try {
    const postId = (req.params as { postId?: string }).postId ?? '';
    const reactions = await prisma.reaction.findMany({
      where: { postId },
      select: { type: true },
    });
    const counts: Record<string, number> = {};
    for (const r of reactions) {
      const norm = CANONICAL_REACTIONS[r.type] ?? r.type;
      counts[norm] = (counts[norm] ?? 0) + 1;
    }
    return res.json({ counts });
  } catch (err) {
    next(err);
  }
});

/** Who reacted, newest first: `?type=like|love|insight`, paged with `?cursor=`. */
router.get('/users', validate(reactorsQuery, 'query'), async (req, res, next) => {
  try {
    const postId = (req.params as { postId?: string }).postId ?? '';
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return res.status(404).json({ message: 'المنشور غير موجود' });
    return res.json(await postReactors(postId, req.query as unknown as ReactorsQuery));
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
    const type = CANONICAL_REACTIONS[parsed.data.type] ?? parsed.data.type;

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return res.status(404).json({ message: 'المنشور غير موجود' });

    const existing = await prisma.reaction.findUnique({
      where: { postId_userId: { postId, userId: req.user!.id } },
    });

    const existingType = existing ? (CANONICAL_REACTIONS[existing.type] ?? existing.type) : null;

    if (existing && existingType === type) {
      // deleteMany: a double-click that already removed it is not an error.
      await prisma.reaction.deleteMany({ where: { id: existing.id } });
      await notifyReaction(postId, req.user!.id, true);
      return res.json({ removed: true, type });
    }

    // upsert: two quick clicks can both see "no reaction" and race to create.
    const saved = await prisma.reaction.upsert({
      where: { postId_userId: { postId, userId: req.user!.id } },
      update: { type },
      create: { postId, userId: req.user!.id, type },
    });
    // Switching from one reaction to another is not news to the author.
    if (!existing) await notifyReaction(postId, req.user!.id, false);
    return res.status(existing ? 200 : 201).json({ removed: false, type: saved.type });
  } catch (err) {
    next(err);
  }
});

export default router;
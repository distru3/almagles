import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

const EXCERPT_LENGTH = 120;

const listSchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

router.get('/', validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const { cursor, limit } = req.query as unknown as z.infer<typeof listSchema>;
    const userId = req.user!.id;

    const rows = await prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        actor: { select: { id: true, name: true, avatarUrl: true } },
        post: { select: { id: true, title: true } },
        comment: { select: { content: true } },
        scheduleItem: { select: { id: true, date: true, title: true, section: true, timeLabel: true, reminderMessage: true } },
      },
    });
    const page = rows.slice(0, limit);

    return res.json({
      notifications: page.map((n) => ({
        id: n.id,
        type: n.type,
        read: n.readAt !== null,
        createdAt: n.createdAt,
        actor: n.actor,
        post: n.post,
        commentId: n.commentId,
        excerpt: n.comment ? n.comment.content.slice(0, EXCERPT_LENGTH) : null,
        scheduleItem: n.scheduleItem,
        scheduleDates: n.scheduleDates,
      })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
      unreadCount: await unreadCount(userId),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    return res.json({ count: await unreadCount(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

const readSchema = z.object({
  /** Omit to mark everything read. */
  ids: z.array(z.string().min(1).max(64)).max(100).optional(),
});

router.post('/read', validate(readSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof readSchema>;
    const userId = req.user!.id;
    await prisma.notification.updateMany({
      // userId in the filter: nobody can mark another person's notifications.
      where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return res.json({ unreadCount: await unreadCount(userId) });
  } catch (err) {
    next(err);
  }
});

export default router;

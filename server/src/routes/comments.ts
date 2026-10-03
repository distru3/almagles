import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireAdmin, canManageCategory } from '../middleware/auth.js';

const router = Router();

const createSchema = z.object({
  content: z.string().trim().min(1, 'التعليق فارغ').max(2000, 'التعليق طويل جداً'),
  parentId: z.string().min(1).max(64).optional(),
});

router.get('/', requireAdmin, async (_req, res, next) => {
  try {
    const comments = await prisma.comment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        author: { select: { id: true, name: true } },
        post: { select: { id: true, title: true } },
        _count: { select: { replies: true } },
      },
    });
    return res.json({
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        postId: c.postId,
        postTitle: c.post.title,
        parentId: c.parentId,
        authorId: c.authorId,
        authorName: c.author.name,
        createdAt: c.createdAt,
        repliesCount: c._count.replies,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/post/:postId', async (req, res, next) => {
  try {
    const { postId } = req.params;
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return res.status(404).json({ message: 'المنشور غير موجود' });

    const comments = await prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, role: true } },
        _count: { select: { replies: true } },
      },
    });
    return res.json({
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        postId: c.postId,
        parentId: c.parentId,
        authorId: c.authorId,
        authorName: c.author.name,
        authorRole: c.author.role,
        createdAt: c.createdAt,
        repliesCount: c._count.replies,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:postId', requireAuth, validate(createSchema), async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { content, parentId } = req.body as z.infer<typeof createSchema>;

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return res.status(404).json({ message: 'المنشور غير موجود' });

    let finalParent: string | null = null;
    if (parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent || parent.postId !== postId) {
        return res.status(400).json({ message: 'التعليق الأصلي غير موجود' });
      }
      // A reply can only be one level deep — attach to the top-level comment.
      finalParent = parent.parentId ?? parent.id;
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        postId,
        authorId: req.user!.id,
        parentId: finalParent,
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });
    return res.status(201).json({
      comment: {
        id: comment.id,
        content: comment.content,
        postId: comment.postId,
        parentId: comment.parentId,
        authorId: comment.authorId,
        authorName: comment.author.name,
        authorRole: comment.author.role,
        createdAt: comment.createdAt,
        repliesCount: 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  content: z.string().trim().min(1, 'التعليق فارغ').max(2000, 'التعليق طويل جداً'),
});

router.put('/:id', requireAuth, validate(updateSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body as z.infer<typeof updateSchema>;
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) return res.status(404).json({ message: 'التعليق غير موجود' });

    if (comment.authorId !== req.user!.id) {
      return res.status(403).json({ message: 'لا يمكنك تعديل هذا التعليق' });
    }

    const updated = await prisma.comment.update({
      where: { id },
      data: { content },
      include: { author: { select: { id: true, name: true, role: true } } },
    });
    return res.json({
      comment: {
        ...updated,
        authorName: updated.author.name,
        authorRole: updated.author.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const comment = await prisma.comment.findUnique({
      where: { id },
      include: { post: { select: { categoryId: true } } },
    });
    if (!comment) return res.status(404).json({ message: 'التعليق غير موجود' });

    const isOwner = comment.authorId === req.user!.id;
    if (!isOwner && !canManageCategory(req.user!, comment.post.categoryId)) {
      return res.status(403).json({ message: 'لا يمكنك حذف هذا التعليق' });
    }

    await prisma.comment.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../db.js';
import { requireAuth, canManageCategory } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { optimizeImage, ALLOWED_MIME_TYPES, MAX_IMAGE_BYTES } from '../lib/image.js';
import { uploadPostImage, deletePostImage } from '../lib/cloudinary.js';
import { HttpError } from '../middleware/error.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new HttpError(400, 'صيغة الصورة غير مدعومة — يُسمح بـ JPG أو PNG أو WebP'));
    }
    cb(null, true);
  },
});

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const listQuerySchema = z.object({
  date: z.string().regex(DATE_REGEX, 'التاريخ غير صالح').optional(),
  category: z.string().min(1).optional(),
  managed: z
    .string()
    .refine((v) => v === '1' || v === '0', 'قيمة غير صالحة')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(10),
});

async function reactionData(postIds: string[], userId?: string) {
  if (postIds.length === 0) {
    return { counts: new Map<string, Record<string, number>>(), mine: new Map<string, string>() };
  }
  const grouped = await prisma.reaction.groupBy({
    by: ['postId', 'type'],
    where: { postId: { in: postIds } },
    _count: { _all: true },
  });
  const counts = new Map<string, Record<string, number>>();
  for (const g of grouped) {
    const row = counts.get(g.postId) ?? {};
    row[g.type] = g._count._all;
    counts.set(g.postId, row);
  }
  const mine = new Map<string, string>();
  if (userId) {
    const myReactions = await prisma.reaction.findMany({
      where: { postId: { in: postIds }, userId },
      select: { postId: true, type: true },
    });
    for (const r of myReactions) mine.set(r.postId, r.type);
  }
  return { counts, mine };
}

router.get('/', validate(listQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { date, category, managed, page, limit } = req.query as unknown as z.infer<typeof listQuerySchema>;
    const user = req.user;
    let userId = user?.id;

    if (managed === '1') {
      if (user?.role !== 'admin' && !(user?.managedCategoryIds.length ?? 0)) {
        return res.status(403).json({ message: 'هذا الإجراء متاح للمشرفين فقط' });
      }
    }

    const where: any = {};
    if (date) where.postDate = date;
    if (managed === '1' && user && user.role !== 'admin') where.categoryId = { in: user.managedCategoryIds };
    if (category) {
      const cat = await prisma.category.findUnique({ where: { slug: category } });
      if (!cat) return res.json({ items: [], total: 0, page, limit });
      where.categoryId = cat.id;
    }

    const [total, posts, commentRows] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: [{ postDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          author: { select: { id: true, name: true } },
        },
      }),
      prisma.comment.groupBy({
        by: ['postId'],
        where: { postId: { in: (await prisma.post.findMany({ where, select: { id: true } })).map((p) => p.id) } },
        _count: { _all: true },
      }),
    ]);

    const commentCounts = new Map<string, number>();
    for (const c of commentRows) commentCounts.set(c.postId, c._count._all);

    const { counts, mine } = await reactionData(posts.map((p) => p.id), userId);

    return res.json({
      items: posts.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        postDate: p.postDate,
        imagePublicId: p.imagePublicId,
        imageUrl: p.imageUrl,
        category: p.category,
        author: p.author,
        createdAt: p.createdAt,
        reactionCounts: counts.get(p.id) ?? {},
        myReaction: mine.get(p.id) ?? null,
        commentsCount: commentCounts.get(p.id) ?? 0,
      })),
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        author: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    });
    if (!post) return res.status(404).json({ message: 'المنشور غير موجود' });

    const reactions = await prisma.reaction.findMany({
      where: { postId: post.id },
      select: { type: true },
    });
    const counts: Record<string, number> = {};
    for (const r of reactions) counts[r.type] = (counts[r.type] ?? 0) + 1;

    let myReaction: string | null = null;
    if (req.user) {
      const me = await prisma.reaction.findUnique({
        where: { postId_userId: { postId: post.id, userId: req.user.id } },
      });
      myReaction = me?.type ?? null;
    }

    return res.json({
      ...post,
      reactionCounts: counts,
      totalReactions: reactions.length,
      myReaction,
    });
  } catch (err) {
    next(err);
  }
});

const postFieldsSchema = z.object({
  title: z.string().trim().min(1, 'العنوان مطلوب').max(200, 'العنوان طويل جداً'),
  description: z.string().trim().min(1, 'نص المنشور مطلوب').max(20000, 'المنشور طويل جداً'),
  categoryId: z.string().min(1, 'يجب اختيار القسم'),
  postDate: z.string().regex(DATE_REGEX, 'تاريخ المنشور غير صالح'),
});

function parsePostFields(raw: any) {
  const parsed = postFieldsSchema.safeParse({
    title: raw?.title ?? '',
    description: raw?.description ?? '',
    categoryId: raw?.categoryId ?? '',
    postDate: raw?.postDate ?? '',
  });
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'بيانات غير صالحة');
  }
  return parsed.data;
}

router.post('/', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const user = req.user!;
    const data = parsePostFields(req.body);
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new HttpError(400, 'القسم المختار غير موجود');
    if (!canManageCategory(user, data.categoryId)) {
      return res.status(403).json({ message: 'لا يمكنك النشر في هذا القسم' });
    }

    let imagePublicId: string | null = null;
    let imageUrl: string | null = null;
    if (req.file) {
      const optimized = await optimizeImage(req.file.buffer);
      const uploaded = await uploadPostImage(optimized);
      imagePublicId = uploaded.publicId;
      imageUrl = uploaded.secureUrl;
    }

    const post = await prisma.post.create({
      data: {
        title: data.title,
        description: data.description,
        postDate: data.postDate,
        categoryId: data.categoryId,
        authorId: user.id,
        imagePublicId,
        imageUrl,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        author: { select: { id: true, name: true } },
      },
    });
    return res.status(201).json({ post });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const user = req.user!;
    const existing = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'المنشور غير موجود' });

    let data: Record<string, any> = {};
    if (req.body?.title !== undefined || req.body?.description !== undefined) {
      data = parsePostFields(req.body);
      const cat = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!cat) throw new HttpError(400, 'القسم المختار غير موجود');
    } else {
      data.categoryId = existing.categoryId;
    }
    if (!canManageCategory(user, data.categoryId) || !canManageCategory(user, existing.categoryId)) {
      return res.status(403).json({ message: 'لا يمكنك إدارة هذا المنشور' });
    }

    let removedOld: string | null = null;
    if (req.file) {
      const optimized = await optimizeImage(req.file.buffer);
      const uploaded = await uploadPostImage(optimized);
      data.imagePublicId = uploaded.publicId;
      data.imageUrl = uploaded.secureUrl;
      removedOld = existing.imagePublicId;
    } else if (req.body?.removeImage === 'true' || req.body?.removeImage === true) {
      data.imagePublicId = null;
      data.imageUrl = null;
      removedOld = existing.imagePublicId;
    }

    const post = await prisma.post.update({
      where: { id: existing.id },
      data,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        author: { select: { id: true, name: true } },
      },
    });

    if (removedOld) await deletePostImage(removedOld);

    return res.json({ post });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'المنشور غير موجود' });
    if (!canManageCategory(req.user!, existing.categoryId)) {
      return res.status(403).json({ message: 'لا يمكنك إدارة هذا المنشور' });
    }
    if (existing.imagePublicId) await deletePostImage(existing.imagePublicId);
    await prisma.post.delete({ where: { id: existing.id } });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
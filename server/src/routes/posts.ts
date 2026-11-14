import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../db.js';
import { requireAuth, requirePublisher, canManageCategory } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ALLOWED_MIME_TYPES, MAX_IMAGE_BYTES } from '../lib/image.js';
import { MAX_POST_IMAGES, postImageStore, removeStoredImages } from '../lib/postImages.js';
import type { StoredImage } from '../lib/postImages.js';
import {
  signVideoUpload,
  findVideo,
  deletePostVideo,
  isOwnVideoId,
  isCloudinaryConfigured,
} from '../lib/cloudinary.js';
import { previewsFor } from '../lib/linkPreview.js';
import { HttpError } from '../middleware/error.js';
import { CANONICAL_REACTIONS } from './reactions.js';
import { notifyNewPost } from '../lib/notifications.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_POST_IMAGES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new HttpError(400, 'صيغة الصورة غير مدعومة — يُسمح بـ JPG أو PNG أو WebP'));
    }
    cb(null, true);
  },
});

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** How a post's photos are returned: in order, cover first. */
const IMAGES = {
  orderBy: { position: 'asc' as const },
  select: { id: true, url: true, width: true, height: true },
};

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  date: z.string().regex(DATE_REGEX, 'التاريخ غير صالح').optional(),
  category: z.string().min(1).optional(),
  author: z.string().min(1).max(40).optional(),
  sort: z.enum(['newest', 'oldest', 'reactions']).default('newest'),
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
    const norm = CANONICAL_REACTIONS[g.type] ?? g.type;
    row[norm] = (row[norm] ?? 0) + g._count._all;
    counts.set(g.postId, row);
  }
  const mine = new Map<string, string>();
  if (userId) {
    const myReactions = await prisma.reaction.findMany({
      where: { postId: { in: postIds }, userId },
      select: { postId: true, type: true },
    });
    for (const r of myReactions) {
      mine.set(r.postId, CANONICAL_REACTIONS[r.type] ?? r.type);
    }
  }
  return { counts, mine };
}

router.get('/', validate(listQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { q, date, category, author, sort, managed, page, limit } = req.query as unknown as z.infer<typeof listQuerySchema>;
    const user = req.user;
    let userId = user?.id;

    if (managed === '1') {
      if (user?.role !== 'admin' && !(user?.managedCategoryIds.length ?? 0)) {
        return res.status(403).json({ message: 'هذا الإجراء متاح للمشرفين فقط' });
      }
    }

    const where: any = {};
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (date) where.postDate = date;
    if (author) where.authorId = author;
    if (managed === '1' && user && user.role !== 'admin') where.categoryId = { in: user.managedCategoryIds };
    if (category) {
      const cat = await prisma.category.findUnique({ where: { slug: category } });
      if (!cat) return res.json({ items: [], total: 0, page, limit });
      where.categoryId = cat.id;
    }

    let orderBy: any[];
    if (sort === 'oldest') {
      orderBy = [{ postDate: 'asc' }, { createdAt: 'asc' }];
    } else if (sort === 'reactions') {
      orderBy = [{ reactions: { _count: 'desc' } }, { postDate: 'desc' }, { createdAt: 'desc' }];
    } else {
      orderBy = [{ postDate: 'desc' }, { createdAt: 'desc' }];
    }

    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          author: { select: { id: true, name: true, role: true, avatarUrl: true } },
          images: IMAGES,
        },
      }),
    ]);

    const postIds = posts.map((p) => p.id);
    const [commentRows, { counts, mine }, latestComments] = await Promise.all([
      postIds.length > 0
        ? prisma.comment.groupBy({
            by: ['postId'],
            where: { postId: { in: postIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      reactionData(postIds, userId),
      // Newest top-level comment per post, for the card's comment preview — one query.
      postIds.length > 0
        ? prisma.comment.findMany({
            where: { postId: { in: postIds }, parentId: null },
            orderBy: { createdAt: 'desc' },
            distinct: ['postId'],
            select: { postId: true, content: true, author: { select: { id: true, name: true, avatarUrl: true } } },
          })
        : Promise.resolve([]),
    ]);
    const topComment = new Map(
      latestComments.map((c) => [c.postId, { content: c.content, authorId: c.author.id, authorName: c.author.name, authorAvatarUrl: c.author.avatarUrl }]),
    );

    const commentCounts = new Map<string, number>();
    for (const c of commentRows) commentCounts.set(c.postId, c._count._all);

    return res.json({
      items: posts.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        postDate: p.postDate,
        images: p.images,
        videoUrl: p.videoUrl,
        videoPosterUrl: p.videoPosterUrl,
        videoWidth: p.videoWidth,
        videoHeight: p.videoHeight,
        videoDuration: p.videoDuration,
        linkPreviews: p.linkPreviews ?? [],
        category: p.category,
        author: p.author,
        createdAt: p.createdAt,
        reactionCounts: counts.get(p.id) ?? {},
        myReaction: mine.get(p.id) ?? null,
        commentsCount: commentCounts.get(p.id) ?? 0,
        topComment: topComment.get(p.id) ?? null,
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
        author: { select: { id: true, name: true, role: true, avatarUrl: true } },
        images: IMAGES,
        _count: { select: { comments: true } },
      },
    });
    if (!post) return res.status(404).json({ message: 'المنشور غير موجود' });

    const reactions = await prisma.reaction.findMany({
      where: { postId: post.id },
      select: { type: true },
    });
    const counts: Record<string, number> = {};
    for (const r of reactions) {
      const norm = CANONICAL_REACTIONS[r.type] ?? r.type;
      counts[norm] = (counts[norm] ?? 0) + 1;
    }

    let myReaction: string | null = null;
    if (req.user) {
      const me = await prisma.reaction.findUnique({
        where: { postId_userId: { postId: post.id, userId: req.user.id } },
      });
      myReaction = me ? (CANONICAL_REACTIONS[me.type] ?? me.type) : null;
    }

    const [prevPost, nextPost] = await Promise.all([
      prisma.post.findFirst({
        where: {
          categoryId: post.categoryId,
          OR: [
            { postDate: { lt: post.postDate } },
            { postDate: post.postDate, createdAt: { lt: post.createdAt } },
          ],
        },
        orderBy: [{ postDate: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, title: true, postDate: true },
      }),
      prisma.post.findFirst({
        where: {
          categoryId: post.categoryId,
          OR: [
            { postDate: { gt: post.postDate } },
            { postDate: post.postDate, createdAt: { gt: post.createdAt } },
          ],
        },
        orderBy: [{ postDate: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, title: true, postDate: true },
      }),
    ]);

    // The old single-image columns are no longer part of the API.
    const { imageUrl: _oldUrl, imagePublicId: _oldId, ...fields } = post;
    return res.json({
      ...fields,
      reactionCounts: counts,
      totalReactions: reactions.length,
      myReaction,
      prevPost,
      nextPost,
    });
  } catch (err) {
    next(err);
  }
});

const postFieldsSchema = z.object({
  title: z.string().trim().min(1, 'العنوان مطلوب').max(200, 'العنوان طويل جداً'),
  // Optional: a post can be just a video, images or a title.
  description: z.string().trim().max(20000, 'المنشور طويل جداً'),
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

/** A signed, one-off ticket for uploading one video straight from the browser to Cloudinary. */
router.post('/video-upload', requirePublisher, (req, res) => {
  if (!isCloudinaryConfigured()) return res.status(503).json({ message: 'خدمة الوسائط غير مكوّنة على الخادم' });
  return res.json(signVideoUpload(req.user!.id));
});

/** Throw away a video this user uploaded but didn't publish (form cancelled or video replaced). */
router.delete('/video-upload/:publicId(*)', requirePublisher, async (req, res, next) => {
  try {
    const publicId = req.params.publicId;
    if (!isOwnVideoId(publicId, req.user!.id)) return res.status(403).json({ message: 'لا يمكنك حذف هذا الملف' });
    const inUse = await prisma.post.findFirst({ where: { videoPublicId: publicId }, select: { id: true } });
    if (!inUse) await deletePostVideo(publicId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** The video fields for a newly uploaded video, after checking it's this user's and really in Cloudinary. */
async function videoFields(publicId: unknown, userId: string) {
  if (typeof publicId !== 'string' || !isOwnVideoId(publicId, userId)) {
    throw new HttpError(400, 'ملف الفيديو غير صالح');
  }
  const video = await findVideo(publicId);
  if (!video) throw new HttpError(400, 'لم يكتمل رفع الفيديو — أعد المحاولة');
  return {
    videoPublicId: video.publicId,
    videoUrl: video.url,
    videoPosterUrl: video.posterUrl,
    videoWidth: video.width,
    videoHeight: video.height,
    videoDuration: video.duration,
  };
}

const NO_VIDEO = {
  videoPublicId: null,
  videoUrl: null,
  videoPosterUrl: null,
  videoWidth: null,
  videoHeight: null,
  videoDuration: null,
};

/**
 * Where each photo goes, in order. Tokens are an existing photo's id or
 * `new:<n>` for the n-th uploaded file. Without a layout, a new post gets
 * its files in upload order and an edit keeps its photos and appends the new ones.
 */
type Slot = { kind: 'existing'; id: string } | { kind: 'new'; index: number };

const layoutSchema = z.array(z.string().min(1).max(64)).max(MAX_POST_IMAGES, `يمكن إضافة ${MAX_POST_IMAGES} صور كحد أقصى`);

function parseLayout(raw: unknown, existingIds: string[], newCount: number): Slot[] {
  let tokens: string[];
  if (raw === undefined || raw === '') {
    tokens = [...existingIds, ...Array.from({ length: newCount }, (_, i) => `new:${i}`)];
  } else {
    let json: unknown;
    try {
      json = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      throw new HttpError(400, 'ترتيب الصور غير صالح');
    }
    const parsed = layoutSchema.safeParse(json);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'ترتيب الصور غير صالح');
    tokens = parsed.data;
  }
  if (tokens.length > MAX_POST_IMAGES) throw new HttpError(400, `يمكن إضافة ${MAX_POST_IMAGES} صور كحد أقصى`);
  if (new Set(tokens).size !== tokens.length) throw new HttpError(400, 'ترتيب الصور غير صالح');

  const known = new Set(existingIds);
  const slots = tokens.map((t): Slot => {
    const m = /^new:(\d{1,2})$/.exec(t);
    if (m) {
      const index = Number(m[1]);
      if (index >= newCount) throw new HttpError(400, 'ترتيب الصور غير صالح');
      return { kind: 'new', index };
    }
    if (!known.has(t)) throw new HttpError(400, 'ترتيب الصور غير صالح');
    return { kind: 'existing', id: t };
  });
  if (slots.filter((x) => x.kind === 'new').length !== newCount) {
    throw new HttpError(400, 'إحدى الصور المرفوعة غير مستخدمة');
  }
  return slots;
}

/** Uploads one at a time (keeps memory flat); if one fails, the ones already stored are removed. */
async function storeFiles(files: Express.Multer.File[]): Promise<StoredImage[]> {
  const stored: StoredImage[] = [];
  try {
    for (const file of files) stored.push(await postImageStore.upload(file.buffer));
    return stored;
  } catch (err) {
    await removeStoredImages(stored.map((x) => x.publicId));
    throw err;
  }
}

const uploadImages = upload.array('images', MAX_POST_IMAGES);
const filesOf = (req: { files?: unknown }) => (Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : []);

const POST_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  author: { select: { id: true, name: true } },
  images: IMAGES,
};

router.post('/', requirePublisher, uploadImages, async (req, res, next) => {
  try {
    const user = req.user!;
    const data = parsePostFields(req.body);
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new HttpError(400, 'القسم المختار غير موجود');
    if (!canManageCategory(user, data.categoryId)) {
      return res.status(403).json({ message: 'لا يمكنك النشر في هذا القسم' });
    }

    const files = filesOf(req);
    const layout = parseLayout(req.body?.layout, [], files.length);
    const video = req.body?.videoPublicId ? await videoFields(req.body.videoPublicId, user.id) : NO_VIDEO;
    const linkPreviews = await previewsFor(data.description, null);

    const stored = await storeFiles(files);
    let post;
    try {
      post = await prisma.post.create({
        data: {
          title: data.title,
          description: data.description,
          postDate: data.postDate,
          categoryId: data.categoryId,
          authorId: user.id,
          ...video,
          linkPreviews: linkPreviews as any,
          images: {
            create: layout.map((slot, position) => ({ ...stored[(slot as { index: number }).index], position })),
          },
        },
        include: POST_INCLUDE,
      });
    } catch (err) {
      await removeStoredImages(stored.map((x) => x.publicId));
      throw err;
    }
    await notifyNewPost(post);
    return res.status(201).json({ post });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requirePublisher, uploadImages, async (req, res, next) => {
  try {
    const user = req.user!;
    const existing = await prisma.post.findUnique({ where: { id: req.params.id }, include: { images: { orderBy: { position: 'asc' } } } });
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

    const files = filesOf(req);
    const layout = parseLayout(req.body?.layout, existing.images.map((i) => i.id), files.length);

    let removedVideo: string | null = null;
    if (req.body?.videoPublicId && req.body.videoPublicId !== existing.videoPublicId) {
      Object.assign(data, await videoFields(req.body.videoPublicId, user.id));
      removedVideo = existing.videoPublicId;
    } else if (req.body?.removeVideo === 'true' || req.body?.removeVideo === true) {
      Object.assign(data, NO_VIDEO);
      removedVideo = existing.videoPublicId;
    }

    if (typeof data.description === 'string' && data.description !== existing.description) {
      data.linkPreviews = await previewsFor(data.description, existing.linkPreviews);
    }

    const kept = new Set(layout.flatMap((slot) => (slot.kind === 'existing' ? [slot.id] : [])));
    const removedImages = existing.images.filter((i) => !kept.has(i.id));

    const stored = await storeFiles(files);
    let post;
    try {
      post = await prisma.$transaction(async (tx) => {
        if (removedImages.length) await tx.postImage.deleteMany({ where: { id: { in: removedImages.map((i) => i.id) } } });
        for (const [position, slot] of layout.entries()) {
          if (slot.kind === 'existing') await tx.postImage.update({ where: { id: slot.id }, data: { position } });
          else await tx.postImage.create({ data: { ...stored[slot.index], position, postId: existing.id } });
        }
        return tx.post.update({ where: { id: existing.id }, data, include: POST_INCLUDE });
      });
    } catch (err) {
      await removeStoredImages(stored.map((x) => x.publicId));
      throw err;
    }

    await removeStoredImages(removedImages.map((i) => i.publicId));
    if (removedVideo) await deletePostVideo(removedVideo);

    return res.json({ post });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.post.findUnique({ where: { id: req.params.id }, include: { images: { select: { publicId: true } } } });
    if (!existing) return res.status(404).json({ message: 'المنشور غير موجود' });
    if (!canManageCategory(req.user!, existing.categoryId)) {
      return res.status(403).json({ message: 'لا يمكنك إدارة هذا المنشور' });
    }
    await prisma.post.delete({ where: { id: existing.id } });
    // After the row is gone: a failed file cleanup must not leave a post pointing at missing photos.
    await removeStoredImages(existing.images.map((i) => i.publicId));
    if (existing.videoPublicId) await deletePostVideo(existing.videoPublicId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
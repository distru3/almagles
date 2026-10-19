import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { optimizeAvatar, ALLOWED_MIME_TYPES } from '../lib/image.js';
import { uploadAvatar, deletePostImage, isCloudinaryConfigured } from '../lib/cloudinary.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { revokeAllSessions } from '../lib/sessions.js';
import { attachSession } from './auth.js';

/** The signed-in user's own profile (/api/profile) and everyone's public profile (/api/profile/:id). */
const router = Router();

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(new HttpError(400, 'صيغة الصورة غير مدعومة — يُسمح بـ JPG أو PNG أو WebP'));
    cb(null, true);
  },
});

const ME_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  canManageSchedule: true,
  avatarUrl: true,
  bio: true,
  managedCategories: { select: { id: true } },
} as const;

function me(user: { id: string; name: string; email: string; role: string; canManageSchedule: boolean; avatarUrl: string | null; bio: string | null; managedCategories: { id: string }[] }) {
  const { managedCategories, ...rest } = user;
  return { ...rest, managedCategoryIds: managedCategories.map((c) => c.id) };
}

const updateSchema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(40, 'الاسم طويل جداً').optional(),
  bio: z
    .string()
    .max(300, 'النبذة طويلة جداً (٣٠٠ حرف على الأكثر)')
    .transform((v) => v.replace(/\s+\n/g, '\n').trim())
    .optional(),
});

router.patch('/', requireAuth, validate(updateSchema), async (req, res, next) => {
  try {
    const { name, bio } = req.body as z.infer<typeof updateSchema>;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { ...(name !== undefined && { name }), ...(bio !== undefined && { bio: bio || null }) },
      select: ME_SELECT,
    });
    return res.json({ user: me(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/avatar', requireAuth, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'لم تُرفق صورة');
    if (!isCloudinaryConfigured()) throw new HttpError(503, 'خدمة الصور غير مكوّنة على الخادم');
    const uploaded = await uploadAvatar(await optimizeAvatar(req.file.buffer));
    const previous = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { avatarPublicId: true } });
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl: uploaded.secureUrl, avatarPublicId: uploaded.publicId },
      select: ME_SELECT,
    });
    if (previous?.avatarPublicId) await deletePostImage(previous.avatarPublicId);
    return res.json({ user: me(user) });
  } catch (err) {
    next(err);
  }
});

router.delete('/avatar', requireAuth, async (req, res, next) => {
  try {
    const previous = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { avatarPublicId: true } });
    const user = await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl: null, avatarPublicId: null }, select: ME_SELECT });
    if (previous?.avatarPublicId) await deletePostImage(previous.avatarPublicId);
    return res.json({ user: me(user) });
  } catch (err) {
    next(err);
  }
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'أدخل كلمة المرور الحالية').max(72),
  newPassword: z.string().min(8, 'كلمة المرور يجب ألا تقل عن ٨ أحرف').max(72, 'كلمة المرور طويلة جداً'),
});

/** Change password: needs the current one; signs out every other device. */
router.post('/password', requireAuth, validate(passwordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body as z.infer<typeof passwordSchema>;
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
      return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
    }
    if (currentPassword === newPassword) return res.status(400).json({ message: 'اختر كلمة مرور مختلفة عن الحالية' });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    await revokeAllSessions(user.id);
    // Keep this device signed in with a fresh session.
    await attachSession(user, req, res);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Public profile: what anyone can see about a member. Never the email. */
router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        role: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
        _count: { select: { posts: true, comments: true } },
      },
    });
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    const { _count, ...rest } = user;
    return res.json({ profile: { ...rest, postsCount: _count.posts, commentsCount: _count.comments } });
  } catch (err) {
    next(err);
  }
});

export default router;

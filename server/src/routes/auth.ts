import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword, dummyPasswordHash } from '../lib/password.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../lib/tokens.js';
import { setAccessCookie, setRefreshCookie, clearAuthCookies, setCsrfCookie } from '../lib/cookies.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import crypto from 'node:crypto';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signupSchema = z.object({
  name: z.string().min(2, 'الاسم قصير جداً').max(40, 'الاسم طويل جداً').trim(),
  email: z.string().toLowerCase().trim().refine((v) => EMAIL_REGEX.test(v), 'البريد الإلكتروني غير صالح'),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب ألا تقل عن ٨ أحرف')
    .max(72, 'كلمة المرور طويلة جداً'),
});

const loginSchema = z.object({
  email: z.string().toLowerCase().trim().refine((v) => EMAIL_REGEX.test(v), 'البريد الإلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة').max(72),
});

function publicUser(user: { id: string; name: string; email: string; role: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

async function attachSession(user: { id: string; role: string; email: string; name: string }, req: Request, res: Response) {
  const now = Date.now();
  const access = signAccessToken({ uid: user.id, role: user.role });
  const { raw, hash } = generateRefreshToken();

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokens: { push: hash } },
  });

  setAccessCookie(res, access);
  setRefreshCookie(res, raw);

  const csrf = (req.cookies?.alm_csrf as string | undefined) ?? crypto.randomBytes(24).toString('hex');
  setCsrfCookie(res, csrf);
  res.locals.csrf = csrf;

  return access;
}

router.post('/signup', validate(signupSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.body as z.infer<typeof signupSchema>;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: 'هذا البريد مسجّل مسبقاً' });
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: 'visitor' },
      select: { id: true, name: true, email: true, role: true },
    });
    await attachSession(user, req, res);
    return res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await verifyPassword(user ? user.passwordHash : await dummyPasswordHash(), password);
    if (!user || !ok) {
      return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
    await attachSession(user, req, res);
    return res.json({
      user: publicUser(user),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const raw = req.cookies?.alm_refresh as string | undefined;
    if (raw) {
      const hash = hashRefreshToken(raw);
      const user = req.user!;
      const current = await prisma.user.findUnique({
        where: { id: user.id },
        select: { refreshTokens: true },
      });
      if (current) {
        await prisma.user.update({
          where: { id: user.id },
          data: { refreshTokens: current.refreshTokens.filter((t) => t !== hash) },
        });
      }
    }
    clearAuthCookies(res);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const raw = req.cookies?.alm_refresh as string | undefined;
    if (!raw) {
      return res.status(401).json({ message: 'لا توجد جلسة نشطة' });
    }
    const hash = hashRefreshToken(raw);
    const user = await prisma.user.findFirst({
      where: { refreshTokens: { has: hash } },
      select: { id: true, name: true, email: true, role: true, refreshTokens: true },
    });
    if (!user) {
      return res.status(401).json({ message: 'انتهت الجلسة، الرجاء تسجيل الدخول مجدداً' });
    }

    const nextToken = generateRefreshToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokens: user.refreshTokens
          .filter((t) => t !== hash)
          .concat(nextToken.hash),
      },
    });

    // Rotate: replace the old refresh cookie with a fresh one.
    const access = signAccessToken({ uid: user.id, role: user.role });
    setAccessCookie(res, access);
    setRefreshCookie(res, nextToken.raw);
    const csrf = (req.cookies?.alm_csrf as string | undefined) ?? crypto.randomBytes(24).toString('hex');
    setCsrfCookie(res, csrf);

    return res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/csrf', (_req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  setCsrfCookie(res, token);
  return res.json({ token });
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user! });
});

export default router;
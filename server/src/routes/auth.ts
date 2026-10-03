import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword, dummyPasswordHash } from '../lib/password.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../lib/tokens.js';
import { setAccessCookie, setRefreshCookie, clearAuthCookies, setCsrfCookie } from '../lib/cookies.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import {
  generateOtp,
  hashOtp,
  normalizeOtp,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
} from '../lib/otp.js';
import { sendVerificationEmail } from '../lib/mail.js';
import crypto from 'node:crypto';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6}$/;

const signupSchema = z.object({
  name: z.string().min(2, 'الاسم قصير جداً').max(40, 'الاسم طويل جداً').trim(),
  email: z.string().toLowerCase().trim().refine((v) => EMAIL_REGEX.test(v), 'البريد الإلكتروني غير صالح'),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب ألا تقل عن ٨ أحرف')
    .max(72, 'كلمة المرور طويلة جداً'),
  code: z.string().refine((v) => CODE_REGEX.test(v), 'رمز التحقق غير صالح'),
});

const sendCodeSchema = z.object({
  email: z.string().toLowerCase().trim().refine((v) => EMAIL_REGEX.test(v), 'البريد الإلكتروني غير صالح'),
  purpose: z.enum(['signup', 'reset']),
});

const resetPasswordSchema = z.object({
  email: z.string().toLowerCase().trim().refine((v) => EMAIL_REGEX.test(v), 'البريد الإلكتروني غير صالح'),
  code: z.string().refine((v) => CODE_REGEX.test(v), 'رمز التحقق غير صالح'),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب ألا تقل عن ٨ أحرف')
    .max(72, 'كلمة المرور طويلة جداً'),
});

const loginSchema = z.object({
  email: z.string().toLowerCase().trim().refine((v) => EMAIL_REGEX.test(v), 'البريد الإلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة').max(72),
});

function publicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  canManageSchedule?: boolean;
  managedCategories?: { id: string }[];
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    canManageSchedule: user.canManageSchedule ?? false,
    managedCategoryIds: user.managedCategories?.map((c) => c.id) ?? [],
  };
}

async function attachSession(user: { id: string; role: string; email: string; name: string }, req: Request, res: Response) {
  const now = Date.now();
  const access = signAccessToken({ uid: user.id, role: user.role });
  const { raw, hash } = generateRefreshToken();

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { refreshTokens: true },
  });
  const updatedTokens = [...(current?.refreshTokens ?? []).slice(-9), hash];

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokens: updatedTokens },
  });

  setAccessCookie(res, access);
  setRefreshCookie(res, raw);

  const csrf = (req.cookies?.alm_csrf as string | undefined) ?? crypto.randomBytes(24).toString('hex');
  setCsrfCookie(res, csrf);
  res.locals.csrf = csrf;

  return access;
}

async function issueCode(email: string, purpose: 'signup' | 'reset') {
  const recent = await prisma.verificationCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: 'desc' },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new HttpError(429, 'الرجاء الانتظار قليلاً قبل طلب رمز جديد');
  }

  const code = generateOtp();
  await prisma.verificationCode.deleteMany({ where: { email, purpose } });
  await prisma.verificationCode.create({
    data: { email, purpose, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  try {
    const sent = await sendVerificationEmail(email, purpose, code);
    return { devCode: sent.devCode, delivered: sent.delivered };
  } catch (err) {
    // Drop the undelivered code so the resend cooldown doesn't block a retry.
    await prisma.verificationCode.deleteMany({ where: { email, purpose } });
    console.error('[mail] send failed', err);
    throw new HttpError(502, 'تعذّر إرسال رمز التحقق، يرجى المحاولة لاحقاً');
  }
}

async function verifyCode(email: string, purpose: 'signup' | 'reset', code: string) {
  const record = await prisma.verificationCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: 'desc' },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, 'رمز التحقق غير صحيح أو منتهي الصلاحية');
  }
  // Claim an attempt atomically: a read-then-write counter lets parallel
  // guesses all see the old count and bypass OTP_MAX_ATTEMPTS.
  const claimed = await prisma.verificationCode.updateMany({
    where: { id: record.id, usedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    throw new HttpError(400, 'انتهت محاولات التحقق — اطلب رمزاً جديداً');
  }
  if (record.codeHash !== hashOtp(normalizeOtp(code))) {
    throw new HttpError(400, 'رمز التحقق غير صحيح');
  }
  // Single use: only one concurrent request can mark the code as used.
  const consumed = await prisma.verificationCode.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count === 0) {
    throw new HttpError(400, 'رمز التحقق غير صحيح أو منتهي الصلاحية');
  }
}

router.post('/send-code', validate(sendCodeSchema), async (req, res, next) => {
  try {
    const { email, purpose } = req.body as z.infer<typeof sendCodeSchema>;
    if (purpose === 'signup') {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ message: 'هذا البريد مسجّل مسبقاً' });
    }
    const { devCode, delivered } = await issueCode(email, purpose);
    return res.status(202).json({
      message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني',
      ...(delivered ? {} : { devCode }),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/signup', validate(signupSchema), async (req, res, next) => {
  try {
    const { name, email, password, code } = req.body as z.infer<typeof signupSchema>;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: 'هذا البريد مسجّل مسبقاً' });
    }
    await verifyCode(email, 'signup', code);
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

router.post('/reset-password', validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const { email, code, password } = req.body as z.infer<typeof resetPasswordSchema>;
    await verifyCode(email, 'reset', code);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new HttpError(400, 'رمز التحقق غير صحيح أو منتهي الصلاحية');
    }
    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, refreshTokens: [] },
    });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { managedCategories: { select: { id: true } } },
    });
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

// No requireAuth: the access token may have lapsed, but the refresh token
// still needs revoking.
router.post('/logout', async (req, res, next) => {
  try {
    const raw = req.cookies?.alm_refresh as string | undefined;
    if (raw) {
      const hash = hashRefreshToken(raw);
      const owner = await prisma.user.findFirst({
        where: { refreshTokens: { has: hash } },
        select: { id: true, refreshTokens: true },
      });
      if (owner) {
        await prisma.user.update({
          where: { id: owner.id },
          data: { refreshTokens: owner.refreshTokens.filter((t) => t !== hash) },
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
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        canManageSchedule: true,
        refreshTokens: true,
        managedCategories: { select: { id: true } },
      },
    });
    if (!user) {
      return res.status(401).json({ message: 'انتهت الجلسة، الرجاء تسجيل الدخول مجدداً' });
    }

    const nextToken = generateRefreshToken();
    const nextTokens = user.refreshTokens
      .filter((t) => t !== hash)
      .slice(-9)
      .concat(nextToken.hash);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokens: nextTokens },
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
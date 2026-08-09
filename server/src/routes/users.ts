import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { hashPassword } from '../lib/password.js';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  canManageSchedule: boolean;
  managedCategories: { id: string; name: string }[];
  createdAt: Date;
}

function mapUser(user: any): AdminUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    canManageSchedule: user.canManageSchedule,
    managedCategories: (user.managedCategories ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    createdAt: user.createdAt,
  };
}

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
});

router.get('/', requireAdmin, validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const { q } = req.query as z.infer<typeof listSchema>;
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        canManageSchedule: true,
        createdAt: true,
        managedCategories: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json({ users: users.map(mapUser) });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(40, 'الاسم طويل جداً'),
  email: z.string().toLowerCase().trim().refine((v) => EMAIL_REGEX.test(v), 'البريد الإلكتروني غير صالح'),
  password: z.string().min(8, 'كلمة المرور يجب ألا تقل عن ٨ أحرف').max(72, 'كلمة المرور طويلة جداً'),
  role: z.enum(['visitor', 'admin']).optional(),
  categoryIds: z.array(z.string().min(1)).max(20).optional(),
  canManageSchedule: z.boolean().optional(),
});

router.post('/', requireAdmin, validate(createSchema), async (req, res, next) => {
  try {
    const { name, email, password, role, categoryIds, canManageSchedule } = req.body as z.infer<typeof createSchema>;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ message: 'هذا البريد مسجّل مسبقاً' });

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        role: role ?? 'visitor',
        canManageSchedule: canManageSchedule ?? false,
        managedCategories: categoryIds && categoryIds.length ? { connect: categoryIds.map((id) => ({ id })) } : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        canManageSchedule: true,
        createdAt: true,
        managedCategories: { select: { id: true, name: true } },
      },
    });
    return res.status(201).json({ user: mapUser(user) });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  role: z.enum(['visitor', 'admin']).optional(),
  categoryIds: z.array(z.string().min(1)).max(20).optional(),
  canManageSchedule: z.boolean().optional(),
});

router.put('/:id', requireAdmin, validate(updateSchema), async (req, res, next) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'المستخدم غير موجود' });

    const { role, categoryIds, canManageSchedule } = req.body as z.infer<typeof updateSchema>;
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: role ?? existing.role,
        canManageSchedule: canManageSchedule ?? existing.canManageSchedule,
        managedCategories:
          categoryIds !== undefined ? { set: categoryIds.map((id) => ({ id })) } : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        canManageSchedule: true,
        createdAt: true,
        managedCategories: { select: { id: true, name: true } },
      },
    });
    return res.json({ user: mapUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
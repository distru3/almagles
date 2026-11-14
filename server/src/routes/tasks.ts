import { Router } from 'express';
import { z } from 'zod';
import type { TaskRepeat } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth, requireScheduleManager } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { linkUrlSchema } from '../lib/linkUrl.js';

/**
 * «مهامي»: tasks every member ticks off (memorise verses, watch the lecture
 * that's due, قيام الليل…). Admins and schedule managers write the tasks and
 * follow everyone's progress; each member sees and ticks only their own.
 */
const router = Router();
const manage = [requireAuth, requireScheduleManager];

function parseDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d;
}

/** The Saturday that starts the week containing `iso` (weeks run Saturday → Friday, like the schedule). */
function weekStartIso(iso: string): string {
  const d = parseDate(iso)!;
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7));
  return d.toISOString().slice(0, 10);
}

/** Which checkmark a task uses on the member's local `date`. */
export function periodOf(repeat: TaskRepeat, date: string): string {
  if (repeat === 'daily') return date;
  if (repeat === 'weekly') return weekStartIso(date);
  return 'once';
}

const DAY_MS = 86_400_000;

/**
 * The member's own "today", sent by the browser so days turn over at their
 * midnight. Ticking is only allowed for a date near the server's, so nobody
 * fills in past days after the fact.
 */
const todaySchema = z
  .string()
  .refine((v) => parseDate(v) !== null, { message: 'تاريخ غير صالح' })
  .refine((v) => Math.abs(parseDate(v)!.getTime() - Date.now()) <= 1.6 * DAY_MS, { message: 'لا يمكن تسجيل المهام لهذا التاريخ' });

const anyDateSchema = z.string().refine((v) => parseDate(v) !== null, { message: 'تاريخ غير صالح' });

const TASK_SELECT = { id: true, title: true, description: true, linkUrl: true, repeat: true, order: true, active: true } as const;

// ---------------------------------------------------------------- members

/** Active tasks with this member's checkmarks for `date`. */
router.get('/', requireAuth, validate(z.object({ date: anyDateSchema }), 'query'), async (req, res, next) => {
  try {
    const { date } = req.query as { date: string };
    const tasks = await prisma.task.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: TASK_SELECT });
    const periods = [...new Set(tasks.map((t) => periodOf(t.repeat, date)))];
    const done = await prisma.taskCompletion.findMany({
      where: { userId: req.user!.id, taskId: { in: tasks.map((t) => t.id) }, period: { in: periods } },
      select: { taskId: true, period: true },
    });
    const doneSet = new Set(done.map((d) => `${d.taskId}|${d.period}`));
    return res.json({ tasks: tasks.map((t) => ({ ...t, done: doneSet.has(`${t.id}|${periodOf(t.repeat, date)}`) })) });
  } catch (err) {
    next(err);
  }
});

const tickSchema = z.object({ date: todaySchema, done: z.boolean() });

/** Tick or untick one task for the member's current day / week. */
router.put('/:id/done', requireAuth, validate(tickSchema), async (req, res, next) => {
  try {
    const { date, done } = req.body as z.infer<typeof tickSchema>;
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, select: { id: true, repeat: true, active: true } });
    if (!task || !task.active) throw new HttpError(404, 'المهمة غير موجودة');
    const key = { taskId: task.id, userId: req.user!.id, period: periodOf(task.repeat, date) };
    if (done) {
      // upsert keeps a double-tap from failing on the unique key.
      await prisma.taskCompletion.upsert({ where: { taskId_userId_period: key }, create: key, update: {} });
    } else {
      await prisma.taskCompletion.deleteMany({ where: key });
    }
    return res.json({ id: task.id, done });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- managers

const taskFields = {
  title: z.string().trim().min(1, 'عنوان المهمة مطلوب').max(200, 'العنوان طويل جداً'),
  description: z
    .string()
    .trim()
    .max(1000, 'الوصف طويل جداً')
    .nullish()
    .transform((v) => v || null),
  linkUrl: linkUrlSchema,
  repeat: z.enum(['daily', 'weekly', 'once'], { message: 'نوع التكرار غير صالح' }),
  active: z.boolean().optional(),
  order: z.number().int().min(0).max(100000).optional(),
};
const createSchema = z.object(taskFields);
const updateSchema = z.object(taskFields).partial();

/** Every task, archived ones included. */
router.get('/manage', ...manage, async (_req, res, next) => {
  try {
    const tasks = await prisma.task.findMany({ orderBy: [{ active: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }], select: TASK_SELECT });
    return res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

router.post('/', ...manage, validate(createSchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof createSchema>;
    const last = await prisma.task.aggregate({ _max: { order: true } });
    const task = await prisma.task.create({
      data: { ...data, order: data.order ?? (last._max.order ?? -1) + 1, createdById: req.user!.id },
      select: TASK_SELECT,
    });
    return res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', ...manage, validate(updateSchema), async (req, res, next) => {
  try {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) throw new HttpError(404, 'المهمة غير موجودة');
    const task = await prisma.task.update({ where: { id: existing.id }, data: req.body, select: TASK_SELECT });
    return res.json({ task });
  } catch (err) {
    next(err);
  }
});

/** Deletes the task and its history. (Archiving — active:false — keeps the history.) */
router.delete('/:id', ...manage, async (req, res, next) => {
  try {
    const { count } = await prisma.task.deleteMany({ where: { id: req.params.id } });
    if (count === 0) throw new HttpError(404, 'المهمة غير موجودة');
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Who has done what for the day / week containing `date`: one row per member
 * with the ids of the active tasks they ticked, plus a count per task.
 */
router.get('/progress', ...manage, validate(z.object({ date: anyDateSchema }), 'query'), async (req, res, next) => {
  try {
    const { date } = req.query as { date: string };
    const tasks = await prisma.task.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: TASK_SELECT });
    const [members, completions] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, avatarUrl: true }, orderBy: { name: 'asc' } }),
      prisma.taskCompletion.findMany({
        where: { OR: tasks.map((t) => ({ taskId: t.id, period: periodOf(t.repeat, date) })) },
        select: { taskId: true, userId: true },
      }),
    ]);
    const byUser = new Map<string, string[]>();
    const counts: Record<string, number> = Object.fromEntries(tasks.map((t) => [t.id, 0]));
    for (const c of completions) {
      (byUser.get(c.userId) ?? byUser.set(c.userId, []).get(c.userId)!).push(c.taskId);
      counts[c.taskId] += 1;
    }
    return res.json({
      date,
      tasks: tasks.map((t) => ({ ...t, period: periodOf(t.repeat, date), doneCount: counts[t.id] })),
      members: members.map((m) => ({ ...m, done: byUser.get(m.id) ?? [] })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

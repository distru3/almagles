import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireScheduleManager } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { linkUrlSchema } from '../lib/linkUrl.js';
import {
  HH_MM,
  appliesOn,
  effectiveDay,
  notOpenYet,
  parseDate,
  periodOf,
  shiftDate,
  weekStartIso,
  type TaskSchedule,
} from '../lib/taskSchedule.js';

export { periodOf };

/**
 * «مهامي»: tasks every member ticks off (memorise verses, watch the lecture
 * that's due, قيام الليل…). Admins and schedule managers write the tasks and
 * follow everyone's progress; each member ticks only their own, earns points
 * for them, and sees how the others are doing on «ساحة الهمّة».
 */
const router = Router();
const manage = [requireAuth, requireScheduleManager];

const DAY_MS = 86_400_000;

const anyDateSchema = z.string().refine((v) => parseDate(v) !== null, { message: 'تاريخ غير صالح' });
/**
 * The member's own "today", sent by the browser so days turn over at their
 * midnight. Ticking is only allowed for a date near the server's, so nobody
 * fills in past days after the fact.
 */
const todaySchema = anyDateSchema.refine((v) => Math.abs(parseDate(v)!.getTime() - Date.now()) <= 1.6 * DAY_MS, {
  message: 'لا يمكن تسجيل المهام لهذا التاريخ',
});
/** The member's local time of day; older pages that don't send it are treated as midday. */
const timeSchema = z.string().regex(HH_MM, 'وقت غير صالح').default('12:00');

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  linkUrl: true,
  repeat: true,
  points: true,
  startDate: true,
  endDate: true,
  weekdays: true,
  timeWindow: true,
  startTime: true,
  endTime: true,
  order: true,
  active: true,
} as const;
const ORDER = [{ order: 'asc' as const }, { createdAt: 'asc' as const }];

// ---------------------------------------------------------------- members

const listQuery = z.object({ date: anyDateSchema, time: timeSchema });

/**
 * The tasks that apply for this member right now, each with their checkmark
 * and how many members have done it this period, plus what's coming tomorrow
 * (so a member can plan for Monday's fast on Sunday evening).
 */
router.get('/', requireAuth, validate(listQuery, 'query'), async (req, res, next) => {
  try {
    const { date, time } = req.query as unknown as z.infer<typeof listQuery>;
    const all = await prisma.task.findMany({ where: { active: true }, orderBy: ORDER, select: TASK_SELECT });
    const tasks = all
      .map((t) => {
        const day = effectiveDay(t, date, time);
        return { ...t, day, period: periodOf(t.repeat, day) };
      })
      .filter((t) => appliesOn(t, t.day));
    const tomorrow = all.filter((t) => {
      const day = effectiveDay(t, date, time);
      return t.repeat === 'daily' && !appliesOn(t, day) && appliesOn(t, shiftDate(day, 1));
    });

    const keys = tasks.map((t) => ({ taskId: t.id, period: t.period }));
    const [mine, counts] = keys.length
      ? await Promise.all([
          prisma.taskCompletion.findMany({ where: { userId: req.user!.id, OR: keys }, select: { taskId: true } }),
          prisma.taskCompletion.groupBy({ by: ['taskId', 'period'], where: { OR: keys }, _count: { _all: true } }),
        ])
      : [[], []];
    const doneSet = new Set(mine.map((d) => d.taskId));
    const countOf = new Map(counts.map((c) => [`${c.taskId}|${c.period}`, c._count._all]));
    return res.json({
      tasks: tasks.map((t) => ({ ...t, done: doneSet.has(t.id), doneCount: countOf.get(`${t.id}|${t.period}`) ?? 0 })),
      tomorrow: tomorrow.map((t) => ({ id: t.id, title: t.title })),
    });
  } catch (err) {
    next(err);
  }
});

const tickSchema = z.object({ date: todaySchema, time: timeSchema, done: z.boolean() });

/** Tick or untick one task for the member's current day / night / week. */
router.put('/:id/done', requireAuth, validate(tickSchema), async (req, res, next) => {
  try {
    const { date, time, done } = req.body as z.infer<typeof tickSchema>;
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, select: TASK_SELECT });
    if (!task || !task.active) throw new HttpError(404, 'المهمة غير موجودة');
    const day = effectiveDay(task, date, time);
    if (!appliesOn(task, day)) throw new HttpError(400, 'هذه المهمة ليست لهذا اليوم');
    if (done && notOpenYet(task, time)) throw new HttpError(400, `لم يحن وقت هذه المهمة بعد — تبدأ الساعة ${task.startTime}`);
    const key = { taskId: task.id, userId: req.user!.id, period: periodOf(task.repeat, day) };
    if (done) {
      // upsert keeps a double-tap from failing on the unique key.
      await prisma.taskCompletion.upsert({
        where: { taskId_userId_period: key },
        create: { ...key, day, points: task.points },
        update: {},
      });
    } else {
      await prisma.taskCompletion.deleteMany({ where: key });
    }
    return res.json({ id: task.id, done, day, points: task.points });
  } catch (err) {
    next(err);
  }
});

/** Badges, in the order they're shown. Their names and texts live in the client. */
const BADGES = [
  { id: 'steady', test: (s: Stats) => s.bestStreak >= 7 },
  { id: 'firm', test: (s: Stats) => s.bestStreak >= 30 },
  { id: 'qawwam', test: (s: Stats) => s.nights >= 7 },
  { id: 'hundred', test: (s: Stats) => s.ticks >= 100 },
] as const;

interface Stats {
  total: number;
  ticks: number;
  week: number;
  today: number;
  streak: number;
  bestStreak: number;
  nights: number;
}

/** Days in a row with at least one task, ending today — or yesterday, since today isn't over. */
function streaks(days: Set<string>, today: string) {
  let d = days.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (days.has(d)) {
    streak += 1;
    d = shiftDate(d, -1);
  }
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of [...days].sort()) {
    run = prev && shiftDate(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return { streak, bestStreak: best };
}

const boardQuery = z.object({ date: anyDateSchema });

/**
 * «ساحة الهمّة», for every member: points this week and in all, streaks,
 * badges, who was first today, and what the others have just done.
 * Only members who have ticked something are listed (plus yourself).
 */
router.get('/board', requireAuth, validate(boardQuery, 'query'), async (req, res, next) => {
  try {
    const { date } = req.query as z.infer<typeof boardQuery>;
    const weekStart = weekStartIso(date);
    const weekEnd = shiftDate(weekStart, 6);
    const [totals, week, today, days, nights, recent, first] = await Promise.all([
      prisma.taskCompletion.groupBy({ by: ['userId'], _sum: { points: true }, _count: { _all: true } }),
      prisma.taskCompletion.groupBy({ by: ['userId'], where: { day: { gte: weekStart, lte: weekEnd } }, _sum: { points: true } }),
      prisma.taskCompletion.groupBy({ by: ['userId'], where: { day: date }, _count: { _all: true } }),
      prisma.taskCompletion.findMany({ distinct: ['userId', 'day'], select: { userId: true, day: true } }),
      prisma.taskCompletion.groupBy({ by: ['userId'], where: { task: { timeWindow: 'qiyam' } }, _count: { _all: true } }),
      prisma.taskCompletion.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { createdAt: true, points: true, userId: true, task: { select: { title: true } } },
      }),
      prisma.taskCompletion.findFirst({ where: { day: date }, orderBy: { createdAt: 'asc' }, select: { userId: true, createdAt: true } }),
    ]);

    const ids = new Set([req.user!.id, ...totals.map((t) => t.userId)]);
    const users = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, avatarUrl: true } });
    const daysOf = new Map<string, Set<string>>();
    for (const d of days) (daysOf.get(d.userId) ?? daysOf.set(d.userId, new Set()).get(d.userId)!).add(d.day);
    const pick = <T extends { userId: string }>(rows: T[]) => new Map(rows.map((r) => [r.userId, r]));
    const [totalOf, weekOf, todayOf, nightsOf] = [pick(totals), pick(week), pick(today), pick(nights)];
    const nameOf = new Map(users.map((u) => [u.id, u]));

    const members = users
      .map((u) => {
        const stats: Stats = {
          total: totalOf.get(u.id)?._sum.points ?? 0,
          ticks: totalOf.get(u.id)?._count._all ?? 0,
          week: weekOf.get(u.id)?._sum.points ?? 0,
          today: todayOf.get(u.id)?._count._all ?? 0,
          nights: nightsOf.get(u.id)?._count._all ?? 0,
          ...streaks(daysOf.get(u.id) ?? new Set(), date),
        };
        return { ...u, ...stats, badges: BADGES.filter((b) => b.test(stats)).map((b) => b.id) };
      })
      .sort((a, b) => b.week - a.week || b.total - a.total || a.name.localeCompare(b.name, 'ar'));

    return res.json({
      date,
      weekStart,
      weekEnd,
      members,
      first: first ? { ...nameOf.get(first.userId), at: first.createdAt } : null,
      recent: recent.map((r) => ({
        name: nameOf.get(r.userId)?.name ?? '',
        avatarUrl: nameOf.get(r.userId)?.avatarUrl ?? null,
        userId: r.userId,
        title: r.task.title,
        points: r.points,
        at: r.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- managers

const optionalDate = z
  .string()
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || parseDate(v) !== null, { message: 'تاريخ غير صالح' });
const optionalTime = z
  .string()
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || HH_MM.test(v), { message: 'وقت غير صالح' });

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
  points: z.number().int().min(1, 'أقل النقاط ١').max(100, 'أكثر النقاط ١٠٠').optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .transform((v) => [...new Set(v)].sort())
    .optional(),
  timeWindow: z.enum(['anytime', 'range', 'qiyam'], { message: 'نوع الوقت غير صالح' }).optional(),
  startTime: optionalTime,
  endTime: optionalTime,
  active: z.boolean().optional(),
  order: z.number().int().min(0).max(100000).optional(),
};

type Fields = Partial<TaskSchedule & { timeWindow: string }>;
/** Checks that need several fields at once, against the task as it will be saved. */
function checkSchedule(t: Fields, ctx: z.RefinementCtx) {
  if (t.startDate && t.endDate && t.endDate < t.startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'تاريخ النهاية قبل تاريخ البداية' });
  }
  if (t.timeWindow === 'range') {
    if (!t.startTime || !t.endTime) ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'حدّد وقت البداية والنهاية' });
    else if (t.startTime === t.endTime) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'وقت النهاية يساوي وقت البداية' });
  }
}
const createSchema = z.object(taskFields).superRefine(checkSchedule);
const updateSchema = z.object(taskFields).partial();

/** Times only belong to a range; weekdays only to a daily task. */
function tidy<T extends Fields>(t: T): T {
  const out = { ...t };
  if (out.timeWindow && out.timeWindow !== 'range') Object.assign(out, { startTime: null, endTime: null });
  if (out.repeat && out.repeat !== 'daily') Object.assign(out, { weekdays: [] });
  return out;
}

/** Every task, archived ones included. */
router.get('/manage', ...manage, async (_req, res, next) => {
  try {
    const tasks = await prisma.task.findMany({ orderBy: [{ active: 'desc' }, ...ORDER], select: TASK_SELECT });
    return res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

router.post('/', ...manage, validate(createSchema), async (req, res, next) => {
  try {
    const data = tidy(req.body as z.infer<typeof createSchema>);
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
    const existing = await prisma.task.findUnique({ where: { id: req.params.id }, select: TASK_SELECT });
    if (!existing) throw new HttpError(404, 'المهمة غير موجودة');
    const patch = req.body as z.infer<typeof updateSchema>;
    const merged = z.object(taskFields).superRefine(checkSchedule).safeParse({ ...existing, ...patch });
    if (!merged.success) throw new HttpError(400, merged.error.issues[0].message);
    const task = await prisma.task.update({ where: { id: existing.id }, data: tidy(patch), select: TASK_SELECT });
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
 * with the ids of the tasks that apply that day and they ticked, plus a count
 * per task. A night task counts the night that began on `date`.
 */
router.get('/progress', ...manage, validate(z.object({ date: anyDateSchema }), 'query'), async (req, res, next) => {
  try {
    const { date } = req.query as { date: string };
    const tasks = (await prisma.task.findMany({ where: { active: true }, orderBy: ORDER, select: TASK_SELECT }))
      .filter((t) => appliesOn(t, date))
      .map((t) => ({ ...t, period: periodOf(t.repeat, date) }));
    const [members, completions] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, avatarUrl: true }, orderBy: { name: 'asc' } }),
      tasks.length
        ? prisma.taskCompletion.findMany({ where: { OR: tasks.map((t) => ({ taskId: t.id, period: t.period })) }, select: { taskId: true, userId: true } })
        : Promise.resolve([]),
    ]);
    const byUser = new Map<string, string[]>();
    const counts: Record<string, number> = Object.fromEntries(tasks.map((t) => [t.id, 0]));
    for (const c of completions) {
      (byUser.get(c.userId) ?? byUser.set(c.userId, []).get(c.userId)!).push(c.taskId);
      counts[c.taskId] += 1;
    }
    return res.json({
      date,
      tasks: tasks.map((t) => ({ ...t, doneCount: counts[t.id] })),
      members: members.map((m) => ({ ...m, done: byUser.get(m.id) ?? [] })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

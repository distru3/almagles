import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireScheduleManager } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { linkUrlSchema } from '../lib/linkUrl.js';
import { pushToUsers } from '../lib/push.js';
import {
  COMEBACK_BONUS,
  HH_MM,
  MAKEUP_DAYS,
  appliesOn,
  effectiveDay,
  makeupPoints,
  notOpenYet,
  prayerClock,
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
/** Today's Fajr and Isha in the member's city, from their browser (see prayerClock). */
const prayerFields = { fajr: z.string().optional(), isha: z.string().optional() };

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

const listQuery = z.object({ date: anyDateSchema, time: timeSchema, ...prayerFields });
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The tasks that apply for this member right now, each with their checkmark
 * and how many members have done it this period, plus what's coming tomorrow
 * (so a member can plan for Monday's fast on Sunday evening), the daily tasks
 * they missed in the last few days and can still make up, and their excuses.
 */
router.get('/', requireAuth, validate(listQuery, 'query'), async (req, res, next) => {
  try {
    const { date, time, fajr, isha } = req.query as unknown as z.infer<typeof listQuery>;
    const prayers = prayerClock(fajr, isha);
    const userId = req.user!.id;
    const [all, me, excuses] = await Promise.all([
      prisma.task.findMany({ where: { active: true }, orderBy: ORDER, select: { ...TASK_SELECT, createdAt: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      prisma.taskExcuse.findMany({ where: { userId, day: { gte: shiftDate(date, -MAKEUP_DAYS - 1), lte: date } }, select: { day: true, reason: true } }),
    ]);
    const excused = new Set(excuses.map((e) => e.day));
    const joined = me ? isoOf(me.createdAt) : date;

    // Missed daily tasks: the last few days before each task's own "today",
    // since the member joined and the task existed, skipping excused days.
    const candidates = all.flatMap((t) => {
      if (t.repeat !== 'daily') return [];
      const today = effectiveDay(t, date, time, prayers);
      return Array.from({ length: MAKEUP_DAYS }, (_, i) => shiftDate(today, -i - 1))
        .filter((d) => appliesOn(t, d) && d >= isoOf(t.createdAt) && d >= joined && !excused.has(d))
        .map((d) => ({ task: t, day: d, today }));
    });
    const madeKeys = candidates.length
      ? await prisma.taskCompletion.findMany({
          where: { userId, OR: candidates.map((c) => ({ taskId: c.task.id, period: c.day })) },
          select: { taskId: true, period: true },
        })
      : [];
    const madeSet = new Set(madeKeys.map((k) => `${k.taskId}|${k.period}`));
    const missed = candidates
      .filter((c) => !madeSet.has(`${c.task.id}|${c.day}`))
      .map(({ task, day, today }) => ({ id: task.id, title: task.title, description: task.description, timeWindow: task.timeWindow, day, points: makeupPoints(task.points, day, today) }));

    const tasks = all
      .map((t) => {
        const day = effectiveDay(t, date, time, prayers);
        return { ...t, day, period: periodOf(t.repeat, day) };
      })
      .filter((t) => appliesOn(t, t.day));
    const tomorrow = all.filter((t) => {
      const day = effectiveDay(t, date, time, prayers);
      return t.repeat === 'daily' && !appliesOn(t, day) && appliesOn(t, shiftDate(day, 1));
    });

    const keys = tasks.map((t) => ({ taskId: t.id, period: t.period }));
    const [mine, counts] = keys.length
      ? await Promise.all([
          prisma.taskCompletion.findMany({ where: { userId, OR: keys }, select: { taskId: true } }),
          prisma.taskCompletion.groupBy({ by: ['taskId', 'period'], where: { OR: keys }, _count: { _all: true } }),
        ])
      : [[], []];
    const doneSet = new Set(mine.map((d) => d.taskId));
    const countOf = new Map(counts.map((c) => [`${c.taskId}|${c.period}`, c._count._all]));
    return res.json({
      tasks: tasks.map(({ createdAt: _c, ...t }) => ({ ...t, done: doneSet.has(t.id), doneCount: countOf.get(`${t.id}|${t.period}`) ?? 0 })),
      tomorrow: tomorrow.map((t) => ({ id: t.id, title: t.title })),
      missed,
      excuses,
    });
  } catch (err) {
    next(err);
  }
});

const tickSchema = z.object({ date: todaySchema, time: timeSchema, done: z.boolean(), ...prayerFields });

/** Tick or untick one task for the member's current day / night / week. */
router.put('/:id/done', requireAuth, validate(tickSchema), async (req, res, next) => {
  try {
    const { date, time, done, fajr, isha } = req.body as z.infer<typeof tickSchema>;
    const prayers = prayerClock(fajr, isha);
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, select: TASK_SELECT });
    if (!task || !task.active) throw new HttpError(404, 'المهمة غير موجودة');
    const day = effectiveDay(task, date, time, prayers);
    if (!appliesOn(task, day)) throw new HttpError(400, 'هذه المهمة ليست لهذا اليوم');
    if (done && notOpenYet(task, time, prayers)) {
      throw new HttpError(
        400,
        task.timeWindow === 'qiyam'
          ? 'وقت القيام من بعد صلاة العشاء إلى الفجر — وما فاتك من الليلة الماضية تجده في «تدارك ما فاتك»'
          : `ليس هذا وقت هذه المهمة — وقتها من ${task.startTime} إلى ${task.endTime}`,
      );
    }
    const userId = req.user!.id;
    const key = { taskId: task.id, userId, period: periodOf(task.repeat, day) };
    if (!done) {
      await prisma.taskCompletion.deleteMany({ where: key });
      return res.json({ id: task.id, done, day, points: 0, comeback: false });
    }
    const existing = await prisma.taskCompletion.findUnique({ where: { taskId_userId_period: key }, select: { points: true } });
    if (existing) return res.json({ id: task.id, done, day, points: existing.points, comeback: false });
    const comeback = await isComeback(userId, day);
    const points = task.points + (comeback ? COMEBACK_BONUS : 0);
    // upsert keeps a double-tap from failing on the unique key.
    await prisma.taskCompletion.upsert({ where: { taskId_userId_period: key }, create: { ...key, day, points }, update: {} });
    return res.json({ id: task.id, done, day, points, comeback });
  } catch (err) {
    next(err);
  }
});

/**
 * «عودة حميدة»: the first tick of `day` after two or more days with nothing
 * done and no excuse, by a member who had taken part before.
 */
async function isComeback(userId: string, day: string): Promise<boolean> {
  const gap = { gte: shiftDate(day, -2), lte: day };
  const [recent, excused, before] = await Promise.all([
    prisma.taskCompletion.count({ where: { userId, day: gap } }),
    prisma.taskExcuse.count({ where: { userId, day: { gte: shiftDate(day, -2), lt: day } } }),
    prisma.taskCompletion.count({ where: { userId, day: { lt: shiftDate(day, -2) } } }),
  ]);
  return recent === 0 && excused === 0 && before > 0;
}

const makeupSchema = z.object({ date: todaySchema, time: timeSchema, day: anyDateSchema, done: z.boolean(), ...prayerFields });

/**
 * «تدارك»: make up a daily task missed on one of the last few days. The full
 * points the next day, half after that; the missed day counts again for the
 * streak. Unticking only removes a made-up tick, never an on-time one.
 */
router.put('/:id/makeup', requireAuth, validate(makeupSchema), async (req, res, next) => {
  try {
    const { date, time, day, done, fajr, isha } = req.body as z.infer<typeof makeupSchema>;
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, select: TASK_SELECT });
    if (!task || !task.active) throw new HttpError(404, 'المهمة غير موجودة');
    if (task.repeat !== 'daily') throw new HttpError(400, 'التدارك للمهام اليومية فقط');
    const today = effectiveDay(task, date, time, prayerClock(fajr, isha));
    if (!(day < today && day >= shiftDate(today, -MAKEUP_DAYS))) throw new HttpError(400, `يمكن تدارك آخر ${MAKEUP_DAYS} أيام فقط`);
    if (!appliesOn(task, day)) throw new HttpError(400, 'هذه المهمة لم تكن لذلك اليوم');
    const key = { taskId: task.id, userId: req.user!.id, period: day };
    if (!done) {
      await prisma.taskCompletion.deleteMany({ where: { ...key, madeUp: true } });
      return res.json({ id: task.id, day, done, points: 0 });
    }
    const points = makeupPoints(task.points, day, today);
    const row = await prisma.taskCompletion.upsert({
      where: { taskId_userId_period: key },
      create: { ...key, day, points, madeUp: true },
      update: {},
      select: { points: true },
    });
    return res.json({ id: task.id, day, done, points: row.points });
  } catch (err) {
    next(err);
  }
});

const MAX_EXCUSES_PER_30_DAYS = 7;
const excuseSchema = z.object({
  date: todaySchema,
  day: anyDateSchema,
  reason: z.enum(['sick', 'travel', 'other'], { message: 'سبب غير صالح' }).nullable(),
});

/**
 * «عذر»: «إذا مرض العبد أو سافر كُتب له مثل ما كان يعمل مقيمًا صحيحًا».
 * An excused day keeps the streak and drops out of the make-up list. Today or
 * the last few days; at most a week's worth a month. `reason: null` removes it.
 */
router.put('/excuse', requireAuth, validate(excuseSchema), async (req, res, next) => {
  try {
    const { date, day, reason } = req.body as z.infer<typeof excuseSchema>;
    const userId = req.user!.id;
    if (day > date || day < shiftDate(date, -MAKEUP_DAYS)) throw new HttpError(400, `العذر لليوم أو لآخر ${MAKEUP_DAYS} أيام فقط`);
    if (reason === null) {
      await prisma.taskExcuse.deleteMany({ where: { userId, day } });
      return res.json({ day, reason });
    }
    const used = await prisma.taskExcuse.count({ where: { userId, day: { gte: shiftDate(date, -29), lte: date, not: day } } });
    if (used >= MAX_EXCUSES_PER_30_DAYS) throw new HttpError(400, `بلغت ${MAX_EXCUSES_PER_30_DAYS} أيام عذر هذا الشهر — شفاك الله ويسّر أمرك`);
    await prisma.taskExcuse.upsert({ where: { userId_day: { userId, day } }, create: { userId, day, reason }, update: { reason } });
    return res.json({ day, reason });
  } catch (err) {
    next(err);
  }
});

const NUDGE_WINDOW_MS = 20 * 60 * 60 * 1000;
const MAX_NUDGES_RECEIVED = 3;

/**
 * «ذكّره بلطف»: a member reminds a brother who's been away from the tasks.
 * Once a day per pair, and a member gets at most three a day.
 */
router.post('/nudge/:userId', requireAuth, async (req, res, next) => {
  try {
    const actor = req.user!;
    const targetId = req.params.userId;
    if (targetId === actor.id) throw new HttpError(400, 'لا يمكنك تذكير نفسك هنا');
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new HttpError(404, 'العضو غير موجود');
    const since = new Date(Date.now() - NUDGE_WINDOW_MS);
    const [mine, theirs] = await Promise.all([
      prisma.notification.count({ where: { type: 'task_nudge', actorId: actor.id, userId: targetId, createdAt: { gte: since } } }),
      prisma.notification.count({ where: { type: 'task_nudge', userId: targetId, createdAt: { gte: since } } }),
    ]);
    if (mine > 0) throw new HttpError(429, 'ذكّرته اليوم — جزاك الله خيرًا');
    if (theirs >= MAX_NUDGES_RECEIVED) throw new HttpError(429, 'ذكّره إخوانه اليوم بما يكفي — ادعُ له بظهر الغيب');
    const n = await prisma.notification.create({ data: { type: 'task_nudge', userId: targetId, actorId: actor.id }, select: { id: true } });
    pushToUsers([
      {
        userId: targetId,
        payload: {
          title: 'رجال الأمة',
          body: `${actor.name} يشدّ أزرك: إخوانك في المهام بانتظارك`,
          url: `/tasks?n=${n.id}`,
          tag: `nudge:${actor.id}`,
        },
      },
    ]);
    return res.status(201).json({ ok: true });
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
  { id: 'mudarik', test: (s: Stats) => s.madeUp >= 10 },
] as const;

interface Stats {
  total: number;
  ticks: number;
  week: number;
  today: number;
  streak: number;
  bestStreak: number;
  nights: number;
  madeUp: number;
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
    const [totals, week, today, days, nights, recent, first, excuses, madeUp] = await Promise.all([
      prisma.taskCompletion.groupBy({ by: ['userId'], _sum: { points: true }, _count: { _all: true } }),
      prisma.taskCompletion.groupBy({ by: ['userId'], where: { day: { gte: weekStart, lte: weekEnd } }, _sum: { points: true } }),
      prisma.taskCompletion.groupBy({ by: ['userId'], where: { day: date }, _count: { _all: true } }),
      prisma.taskCompletion.findMany({ distinct: ['userId', 'day'], select: { userId: true, day: true } }),
      prisma.taskCompletion.groupBy({ by: ['userId'], where: { task: { timeWindow: 'qiyam' } }, _count: { _all: true } }),
      prisma.taskCompletion.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { createdAt: true, points: true, madeUp: true, userId: true, task: { select: { title: true } } },
      }),
      prisma.taskCompletion.findFirst({ where: { day: date, madeUp: false }, orderBy: { createdAt: 'asc' }, select: { userId: true, createdAt: true } }),
      prisma.taskExcuse.findMany({ select: { userId: true, day: true } }),
      prisma.taskCompletion.groupBy({ by: ['userId'], where: { madeUp: true }, _count: { _all: true } }),
    ]);

    const ids = new Set([req.user!.id, ...totals.map((t) => t.userId)]);
    const users = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, avatarUrl: true } });
    const daysOf = new Map<string, Set<string>>();
    // An excused day keeps the streak going, just like a day with work in it.
    for (const d of [...days, ...excuses]) (daysOf.get(d.userId) ?? daysOf.set(d.userId, new Set()).get(d.userId)!).add(d.day);
    const excusedToday = new Set(excuses.filter((e) => e.day === date).map((e) => e.userId));
    const pick = <T extends { userId: string }>(rows: T[]) => new Map(rows.map((r) => [r.userId, r]));
    const [totalOf, weekOf, todayOf, nightsOf, madeUpOf] = [pick(totals), pick(week), pick(today), pick(nights), pick(madeUp)];
    const nameOf = new Map(users.map((u) => [u.id, u]));

    const members = users
      .map((u) => {
        const stats: Stats = {
          total: totalOf.get(u.id)?._sum.points ?? 0,
          ticks: totalOf.get(u.id)?._count._all ?? 0,
          week: weekOf.get(u.id)?._sum.points ?? 0,
          today: todayOf.get(u.id)?._count._all ?? 0,
          nights: nightsOf.get(u.id)?._count._all ?? 0,
          madeUp: madeUpOf.get(u.id)?._count._all ?? 0,
          ...streaks(daysOf.get(u.id) ?? new Set(), date),
        };
        const active = [...(daysOf.get(u.id) ?? [])].filter((d) => d <= date).sort();
        return {
          ...u,
          ...stats,
          /** The last day they worked or were excused, for «إخوانٌ نفتقدهم». */
          lastDay: active[active.length - 1] ?? null,
          excusedToday: excusedToday.has(u.id),
          badges: BADGES.filter((b) => b.test(stats)).map((b) => b.id),
        };
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
        madeUp: r.madeUp,
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

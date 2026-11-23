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
  areMutuallyExclusive,
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
import { learningStreak } from '../lib/learning.js';
import { isComeback } from '../lib/taskTicks.js';
import { keepCount, partnersOf, periodsBetween, slotState, taskStreak, type HistoryTask, type MemberLog } from '../lib/taskHistory.js';

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
  fromLearning: true,
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
    const candidateDays = [...new Set(candidates.map((c) => c.day))];
    const madeKeys = candidateDays.length
      ? await prisma.taskCompletion.findMany({
          where: { userId, period: { in: candidateDays } },
          select: { taskId: true, period: true, task: { select: { title: true } } },
        })
      : [];
    const madeSet = new Set(madeKeys.map((k) => `${k.taskId}|${k.period}`));
    const missed = candidates
      .filter((c) => {
        if (madeSet.has(`${c.task.id}|${c.day}`)) return false;
        const doneOnDay = madeKeys.filter((k) => k.period === c.day);
        return !doneOnDay.some((k) => areMutuallyExclusive(c.task.title, k.task.title));
      })
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
    const periodCompletions = await prisma.taskCompletion.findMany({
      where: { userId, period: key.period },
      select: { task: { select: { id: true, title: true } } },
    });
    const conflict = periodCompletions.find((c) => c.task.id !== task.id && areMutuallyExclusive(task.title, c.task.title));
    if (conflict) {
      throw new HttpError(400, `أنجزت بالفعل «${conflict.task.title}» — لا يمكن الجمع بينهما`);
    }
    const comeback = await isComeback(userId, day);
    const points = task.points + (comeback ? COMEBACK_BONUS : 0);
    // upsert keeps a double-tap from failing on the unique key.
    await prisma.taskCompletion.upsert({ where: { taskId_userId_period: key }, create: { ...key, day, points }, update: {} });
    return res.json({ id: task.id, done, day, points, comeback });
  } catch (err) {
    next(err);
  }
});

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
    const dayCompletions = await prisma.taskCompletion.findMany({
      where: { userId: req.user!.id, period: day },
      select: { task: { select: { id: true, title: true } } },
    });
    const conflict = dayCompletions.find((c) => c.task.id !== task.id && areMutuallyExclusive(task.title, c.task.title));
    if (conflict) {
      throw new HttpError(400, `أنجزت بالفعل «${conflict.task.title}» لذلك اليوم`);
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
  // «طلب العلم» — the race isn't in worship alone.
  { id: 'talib', test: (s: Stats) => s.lessons >= 10 },
  { id: 'mulazim', test: (s: Stats) => s.ilmBestStreak >= 7 },
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
  /** «رحلة العلم»: lessons done, their points in all and this week, and «سلسلة العلم». */
  lessons: number;
  ilmTotal: number;
  ilmWeek: number;
  ilmStreak: number;
  ilmBestStreak: number;
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
 * badges, who was first today, and what the others have just done — in
 * worship and in «طلب العلم» together, with the share of each, so the
 * board can be read as one race or as either.
 * Only members who have ticked something are listed (plus yourself).
 */
router.get('/board', requireAuth, validate(boardQuery, 'query'), async (req, res, next) => {
  try {
    const { date } = req.query as z.infer<typeof boardQuery>;
    const weekStart = weekStartIso(date);
    const weekEnd = shiftDate(weekStart, 6);
    const [taskTotals, taskWeek, taskToday, taskDays, nights, taskRecent, first, excuses, taskMadeUp, learning] = await Promise.all([
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
      learningOnBoard(date, weekStart, weekEnd),
    ]);
    // «رحلة العلم» lessons count here like tasks: points, ticks, streak days, the feed.
    const totals = [...taskTotals, ...learning.totals];
    const days = [...taskDays, ...learning.days];
    const recent = [
      ...taskRecent.map(({ task, ...r }) => ({ ...r, title: task.title, learning: false })),
      ...learning.recent.map(({ item, ...r }) => ({ ...r, title: item.title, learning: true })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 15);

    const ids = new Set([req.user!.id, ...totals.map((t) => t.userId)]);
    const users = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, avatarUrl: true } });
    const daysOf = new Map<string, Set<string>>();
    // An excused day keeps the streak going, just like a day with work in it.
    for (const d of [...days, ...excuses]) (daysOf.get(d.userId) ?? daysOf.set(d.userId, new Set()).get(d.userId)!).add(d.day);
    const excusedToday = new Set(excuses.filter((e) => e.day === date).map((e) => e.userId));
    /** Points and counts per member, tasks and lessons added together. */
    const sum = (rows: { userId: string; _sum?: { points: number | null }; _count?: { _all: number } }[]) => {
      const out = new Map<string, { points: number; count: number }>();
      for (const r of rows) {
        const s = out.get(r.userId) ?? out.set(r.userId, { points: 0, count: 0 }).get(r.userId)!;
        s.points += r._sum?.points ?? 0;
        s.count += r._count?._all ?? 0;
      }
      return out;
    };
    const totalOf = sum(totals);
    const weekOf = sum([...taskWeek, ...learning.week]);
    const todayOf = sum([...taskToday, ...learning.today]);
    const nightsOf = sum(nights);
    const madeUpOf = sum([...taskMadeUp, ...learning.madeUp]);
    const ilmTotalOf = sum(learning.totals);
    const ilmWeekOf = sum(learning.week);
    const ilmDaysOf = new Map<string, Set<string>>();
    for (const d of learning.days) (ilmDaysOf.get(d.userId) ?? ilmDaysOf.set(d.userId, new Set()).get(d.userId)!).add(d.day);
    const excusedOf = new Map<string, Set<string>>();
    for (const e of excuses) (excusedOf.get(e.userId) ?? excusedOf.set(e.userId, new Set()).get(e.userId)!).add(e.day);
    const lessonDays = learning.items.map((i) => i.date);
    const nameOf = new Map(users.map((u) => [u.id, u]));

    const members = users
      .map((u) => {
        const stats: Stats = {
          total: totalOf.get(u.id)?.points ?? 0,
          ticks: totalOf.get(u.id)?.count ?? 0,
          week: weekOf.get(u.id)?.points ?? 0,
          today: todayOf.get(u.id)?.count ?? 0,
          nights: nightsOf.get(u.id)?.count ?? 0,
          madeUp: madeUpOf.get(u.id)?.count ?? 0,
          ...streaks(daysOf.get(u.id) ?? new Set(), date),
          lessons: ilmTotalOf.get(u.id)?.count ?? 0,
          ilmTotal: ilmTotalOf.get(u.id)?.points ?? 0,
          ilmWeek: ilmWeekOf.get(u.id)?.points ?? 0,
          ...(({ streak, bestStreak }) => ({ ilmStreak: streak, ilmBestStreak: bestStreak }))(
            learningStreak(lessonDays, ilmDaysOf.get(u.id) ?? new Set(), excusedOf.get(u.id) ?? new Set(), date, learning.startOf.get(u.id) ?? null),
          ),
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
      /** «السبّاق إلى العلم»: the first to finish one of today's lessons. */
      firstIlm: learning.first ? { ...nameOf.get(learning.first.userId), at: learning.first.createdAt } : null,
      recent: recent.map((r) => ({
        name: nameOf.get(r.userId)?.name ?? '',
        avatarUrl: nameOf.get(r.userId)?.avatarUrl ?? null,
        userId: r.userId,
        title: r.title,
        points: r.points,
        madeUp: r.madeUp,
        learning: r.learning,
        at: r.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * The same sums as «ساحة الهمّة» takes from tasks, from the lessons of «رحلة العلم».
 * Part of a lesson («أنجزت بعضه») earns its points and keeps «سلسلة العلم», but
 * only a finished lesson is counted as one, is first today, or shows in the feed.
 */
async function learningOnBoard(date: string, weekStart: string, weekEnd: string) {
  const finished = { progress: 100 };
  const [points, counts, week, today, days, madeUp, recentRows, firstRow, items, enrollments] = await Promise.all([
    prisma.learningCompletion.groupBy({ by: ['userId'], _sum: { points: true } }),
    prisma.learningCompletion.groupBy({ by: ['userId'], where: finished, _count: { _all: true } }),
    prisma.learningCompletion.groupBy({ by: ['userId'], where: { day: { gte: weekStart, lte: weekEnd } }, _sum: { points: true } }),
    prisma.learningCompletion.groupBy({ by: ['userId'], where: { ...finished, day: date }, _count: { _all: true } }),
    prisma.learningCompletion.findMany({ distinct: ['userId', 'day'], select: { userId: true, day: true } }),
    prisma.learningCompletion.groupBy({ by: ['userId'], where: { ...finished, madeUp: true }, _count: { _all: true } }),
    prisma.learningCompletion.findMany({
      where: finished,
      orderBy: { doneAt: 'desc' },
      take: 15,
      select: { doneAt: true, createdAt: true, points: true, madeUp: true, userId: true, item: { select: { title: true } } },
    }),
    prisma.learningCompletion.findFirst({ where: { ...finished, day: date, madeUp: false }, orderBy: { doneAt: 'asc' }, select: { userId: true, doneAt: true, createdAt: true } }),
    prisma.learningItem.findMany({ select: { date: true } }),
    prisma.learningEnrollment.findMany({ select: { userId: true, startDay: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.userId, c._count._all]));
  const totals = points.map((p) => ({ userId: p.userId, _sum: p._sum, _count: { _all: countOf.get(p.userId) ?? 0 } }));
  const recent = recentRows.map(({ doneAt, createdAt, ...r }) => ({ ...r, createdAt: doneAt ?? createdAt }));
  const first = firstRow ? { userId: firstRow.userId, createdAt: firstRow.doneAt ?? firstRow.createdAt } : null;
  const startOf = new Map(enrollments.map((e) => [e.userId, e.startDay]));
  return { totals, week, today, days, madeUp, recent, first, items, startOf };
}

// ---------------------------------------------------------------- history

const historyQuery = z.object({ date: anyDateSchema, time: timeSchema, ...prayerFields });
/** Weeks shown in «بستان العام» (the current one included). */
const HISTORY_WEEKS = 26;
/** Days a task's «ثباتي» looks back over, and weeks for a weekly task. */
const KEEP_DAYS = 30;
const KEEP_WEEKS = 8;

/** The member's devotional "today": before Fajr it's still the day before, as for ticking. */
function devotionalToday(q: z.infer<typeof historyQuery>): string {
  return q.time < prayerClock(q.fajr, q.isha).fajr ? shiftDate(q.date, -1) : q.date;
}

const HISTORY_TASK_SELECT = { ...TASK_SELECT, createdAt: true } as const;

/**
 * «سجلّي», the member's own record and nobody else's: points and ticks for
 * every day since they started, what they did on each day of the last six
 * months, their excused days, and for each current task how faithfully
 * they've kept it lately (with a strip of the last 30 days / 8 weeks).
 * Nothing is ever pruned — the whole history stays.
 */
router.get('/history', requireAuth, validate(historyQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof historyQuery>;
    const userId = req.user!.id;
    const today = devotionalToday(q);
    const from = shiftDate(weekStartIso(today), -7 * (HISTORY_WEEKS - 1));
    const [completions, excuses, tasks, lessons, lessonDates, enrollment] = await Promise.all([
      prisma.taskCompletion.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { taskId: true, period: true, day: true, points: true, madeUp: true },
      }),
      prisma.taskExcuse.findMany({ where: { userId }, orderBy: { day: 'asc' }, select: { day: true, reason: true } }),
      prisma.task.findMany({ orderBy: ORDER, select: HISTORY_TASK_SELECT }),
      // «رحلة العلم» belongs to the record too: worship and learning, day by day.
      prisma.learningCompletion.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { itemId: true, day: true, points: true, madeUp: true, progress: true, item: { select: { title: true } } },
      }),
      prisma.learningItem.findMany({ select: { date: true } }),
      prisma.learningEnrollment.findUnique({ where: { userId }, select: { active: true, startDay: true } }),
    ]);

    const days = new Map<string, { day: string; points: number; count: number; lessons: number; ilmPoints: number }>();
    const log = new Map<string, { taskId: string; points: number; madeUp: boolean; learning: boolean; progress?: number }[]>();
    const dayOf = (day: string) => days.get(day) ?? days.set(day, { day, points: 0, count: 0, lessons: 0, ilmPoints: 0 }).get(day)!;
    for (const c of completions) {
      const d = dayOf(c.day);
      d.points += c.points;
      d.count += 1;
      if (c.day >= from) (log.get(c.day) ?? log.set(c.day, []).get(c.day)!).push({ taskId: c.taskId, points: c.points, madeUp: c.madeUp, learning: false });
    }
    for (const l of lessons) {
      const d = dayOf(l.day);
      const finished = l.progress >= 100;
      d.points += l.points;
      d.ilmPoints += l.points;
      // Part of a lesson shows in the day's log with how far it got, but isn't counted as a lesson done.
      if (finished) {
        d.count += 1;
        d.lessons += 1;
      }
      if (l.day >= from) {
        (log.get(l.day) ?? log.set(l.day, []).get(l.day)!).push({
          taskId: `lesson:${l.itemId}`,
          points: l.points,
          madeUp: l.madeUp,
          learning: true,
          ...(finished ? {} : { progress: l.progress }),
        });
      }
    }
    const sortedDays = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
    const memberLog: MemberLog = {
      done: new Set(completions.map((c) => `${c.taskId}|${c.period}`)),
      excused: new Set(excuses.map((e) => e.day)),
      // How faithfully a task is kept counts from the first task, not the first lesson.
      firstDay: completions.reduce<string | null>((m, c) => (!m || c.day < m ? c.day : m), null),
    };
    const partners = partnersOf(tasks);
    const totalOf = new Map<string, number>();
    const lastOf = new Map<string, string>();
    for (const c of completions) {
      totalOf.set(c.taskId, (totalOf.get(c.taskId) ?? 0) + 1);
      if ((lastOf.get(c.taskId) ?? '') < c.day) lastOf.set(c.taskId, c.day);
    }
    const summary = (t: (typeof tasks)[number]) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      repeat: t.repeat,
      timeWindow: t.timeWindow,
      total: totalOf.get(t.id) ?? 0,
      lastDay: lastOf.get(t.id) ?? null,
    });
    // A task that's archived or whose last day has passed: its record stays, under «من سجلّك السابق».
    const isPast = (t: (typeof tasks)[number]) => !t.active || (!!t.endDate && t.endDate < today);

    const keep = tasks
      .filter((t) => !isPast(t))
      .map((t) => {
        if (t.repeat === 'once') {
          // A one-off task: done (and when), or still waiting.
          const done = totalOf.has(t.id);
          return { ...summary(t), kept: done ? 1 : 0, possible: done ? 1 : 0, streak: 0, strip: [] as string[] };
        }
        const weekly = t.repeat === 'weekly';
        const start = weekly ? shiftDate(weekStartIso(today), -7 * (KEEP_WEEKS - 1)) : shiftDate(today, -(KEEP_DAYS - 1));
        const mine = partners.get(t.id) ?? [];
        const periods = weekly
          ? Array.from({ length: KEEP_WEEKS }, (_, i) => shiftDate(start, 7 * i))
          : Array.from({ length: KEEP_DAYS }, (_, i) => shiftDate(start, i));
        return {
          ...summary(t),
          ...keepCount(t, start, today, memberLog, mine, today),
          streak: taskStreak(t, memberLog, mine, today),
          // A period outside the task's days (a Monday-only fast on Tuesday) is "off".
          strip: periods.map((p) => (appliesOn(t, p) ? slotState(t, p, memberLog, mine, today) : 'off')),
        };
      });
    const past = tasks.filter((t) => isPast(t) && totalOf.has(t.id)).map(summary);

    const referenced = new Set(completions.filter((c) => c.day >= from).map((c) => c.taskId));
    return res.json({
      today,
      from,
      days: sortedDays,
      log: [...log.entries()].map(([day, items]) => ({ day, items })),
      titles: {
        ...Object.fromEntries(tasks.filter((t) => referenced.has(t.id)).map((t) => [t.id, t.title])),
        ...Object.fromEntries(lessons.filter((l) => l.day >= from).map((l) => [`lesson:${l.itemId}`, l.item.title])),
      },
      learning: {
        enrolled: enrollment?.active ?? false,
        lessons: lessons.filter((l) => l.progress >= 100).length,
        points: lessons.reduce((n, l) => n + l.points, 0),
        ...learningStreak(
          lessonDates.map((i) => i.date),
          new Set(lessons.map((l) => l.day)),
          new Set(excuses.map((e) => e.day)),
          today,
          enrollment?.startDay ?? null,
        ),
      },
      excused: excuses,
      tasks: keep,
      past,
    });
  } catch (err) {
    next(err);
  }
});

/** Days «حال المجلس» measures over, and how many days its activity chart shows. */
const COMMUNITY_DAYS = 30;
const COMMUNITY_SERIES_DAYS = 56;
/** A task needs at least this many chances across the members before it can be «همّة الأسبوع». */
const FOCUS_MIN_POSSIBLE = 5;

/** Kept / possible for each task across `members`, over [from, to]. */
function communityRates(tasks: HistoryTask[], logs: Map<string, MemberLog>, members: string[], from: string, to: string, today: string) {
  const partners = partnersOf(tasks);
  return tasks.map((t) => {
    let kept = 0;
    let possible = 0;
    for (const id of members) {
      if (t.repeat === 'once') {
        // A one-off task: of the brothers active now, how many have done it (once it had opened).
        const done = logs.get(id)!.done.has(`${t.id}|once`);
        if (done || !t.startDate || t.startDate <= to) {
          possible += 1;
          if (done) kept += 1;
        }
        continue;
      }
      const r = keepCount(t, from, to, logs.get(id)!, partners.get(t.id) ?? [], today);
      kept += r.kept;
      possible += r.possible;
    }
    return { task: t, kept, possible, rate: possible ? kept / possible : 0 };
  });
}

/**
 * «حال المجلس», for every member — and anonymous: what the circle did together
 * in the last 30 days, which tasks are kept most and which need our himma, the
 * daily activity of the last eight weeks, and «همّة الأسبوع»: the least-kept
 * task of the month before this Saturday, to revive together this week. Only
 * members who did something in a window are counted in it.
 */
router.get('/community', requireAuth, validate(historyQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof historyQuery>;
    const today = devotionalToday(q);
    const from = shiftDate(today, -COMMUNITY_DAYS);
    const to = shiftDate(today, -1);
    const weekStart = weekStartIso(today);
    const focusFrom = shiftDate(weekStart, -COMMUNITY_DAYS);
    const focusTo = shiftDate(weekStart, -1);
    const seriesFrom = shiftDate(today, -(COMMUNITY_SERIES_DAYS - 1));
    const since = shiftDate([focusFrom, from, seriesFrom].sort()[0], -6);

    const [completions, onceDone, firsts, excuses, allTasks] = await Promise.all([
      prisma.taskCompletion.findMany({
        where: { day: { gte: since } },
        select: { taskId: true, userId: true, period: true, day: true, points: true, madeUp: true, task: { select: { timeWindow: true } } },
      }),
      // One-off tasks may have been done long before this window.
      prisma.taskCompletion.findMany({ where: { period: 'once' }, select: { taskId: true, userId: true } }),
      prisma.taskCompletion.groupBy({ by: ['userId'], _min: { day: true } }),
      prisma.taskExcuse.findMany({ where: { day: { gte: since } }, select: { userId: true, day: true } }),
      prisma.task.findMany({ where: { active: true }, orderBy: ORDER, select: HISTORY_TASK_SELECT }),
    ]);
    const lessons = await prisma.learningCompletion.findMany({
      where: { day: { gte: seriesFrom < from ? seriesFrom : from, lte: today } },
      select: { userId: true, day: true, points: true, progress: true },
    });
    // Lessons are counted when finished; part of one still adds its points.
    const finishedLessons = lessons.filter((l) => l.progress >= 100);
    // Every kind of task is measured; one whose last day has passed no longer is.
    const tasks = allTasks.filter((t) => !t.endDate || t.endDate >= from);
    const repeating = tasks.filter((t) => t.repeat !== 'once');

    const logs = new Map<string, MemberLog>(
      firsts.map((f) => [f.userId, { done: new Set<string>(), excused: new Set<string>(), firstDay: f._min.day }]),
    );
    for (const c of [...completions, ...onceDone]) logs.get(c.userId)?.done.add(`${c.taskId}|${'period' in c ? c.period : 'once'}`);
    for (const e of excuses) logs.get(e.userId)?.excused.add(e.day);
    const activeIn = (a: string, b: string) => [...new Set(completions.filter((c) => c.day >= a && c.day <= b).map((c) => c.userId))];

    const inWindow = completions.filter((c) => c.day >= from && c.day <= today);
    const members = activeIn(from, today);
    const rates = communityRates(tasks, logs, members, from, to, today)
      .filter((r) => r.possible > 0)
      .sort((a, b) => b.rate - a.rate || b.kept - a.kept);

    const perDay = new Map<string, number>();
    for (const c of completions) if (c.day >= seriesFrom && c.day <= today) perDay.set(c.day, (perDay.get(c.day) ?? 0) + 1);
    const ilmPerDay = new Map<string, number>();
    for (const l of finishedLessons) if (l.day >= seriesFrom) ilmPerDay.set(l.day, (ilmPerDay.get(l.day) ?? 0) + 1);
    // `count` is everything done that day; `ilm` the lessons among it.
    const series = Array.from({ length: COMMUNITY_SERIES_DAYS }, (_, i) => {
      const day = shiftDate(seriesFrom, i);
      const ilm = ilmPerDay.get(day) ?? 0;
      return { day, count: (perDay.get(day) ?? 0) + ilm, ilm };
    });
    const lessonsInWindow = lessons.filter((l) => l.day >= from);

    // «همّة الأسبوع» is chosen from the month before this Saturday, so it holds all week.
    const weekEnd = shiftDate(weekStart, 6);
    const thisWeek = (t: HistoryTask) => periodsBetween(t, weekStart, weekEnd).length > 0;
    const lowest = communityRates(repeating.filter(thisWeek), logs, activeIn(focusFrom, focusTo), focusFrom, focusTo, today)
      .filter((r) => r.possible >= FOCUS_MIN_POSSIBLE)
      .sort((a, b) => a.rate - b.rate || a.task.order - b.task.order)[0];
    let focus = null;
    if (lowest) {
      const [week] = communityRates([lowest.task], logs, activeIn(focusFrom, today), weekStart, today, today);
      focus = {
        id: lowest.task.id,
        title: lowest.task.title,
        timeWindow: lowest.task.timeWindow,
        before: lowest.rate,
        // Done today counts already; today's not-yet-done is still pending.
        week: { kept: week.kept, possible: week.possible },
      };
    }

    return res.json({
      today,
      from,
      members: members.length,
      totals: {
        ticks: inWindow.length,
        points: inWindow.reduce((n, c) => n + c.points, 0),
        nights: inWindow.filter((c) => c.task.timeWindow === 'qiyam').length,
        madeUp: inWindow.filter((c) => c.madeUp).length,
        /** «دروس العلم»: lessons of «رحلة العلم» finished in the window, and by how many brothers. */
        lessons: lessonsInWindow.filter((l) => l.progress >= 100).length,
        ilmPoints: lessonsInWindow.reduce((n, l) => n + l.points, 0),
        learners: new Set(lessonsInWindow.map((l) => l.userId)).size,
      },
      tasks: rates.map((r) => ({ id: r.task.id, title: r.task.title, timeWindow: r.task.timeWindow, repeat: r.task.repeat, rate: r.rate, kept: r.kept, possible: r.possible })),
      series,
      focus,
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
  fromLearning: z.boolean().optional(),
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

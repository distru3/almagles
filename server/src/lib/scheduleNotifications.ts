import { prisma } from '../db.js';
import { pushToUsers } from './push.js';

/**
 * Two kinds of schedule notification:
 * - «تحديث الجدول»: sessions were added, changed or removed. A manager usually
 *   edits many rows in a row, so changes are gathered and sent once the edits
 *   have been quiet for a moment — one popup per burst, not one per row.
 * - «حان وقت المجلس»: a session with a start time has begun. A timer checks
 *   every half minute for sessions whose remindAt has passed.
 * Like every notification, failures are logged and never fail the request.
 */

const SITE_NAME = 'رجال الأمة';

/** How long edits must stop before the change notification goes out. */
export const CHANGE_QUIET_MS = 2 * 60 * 1000;
/** How often due reminders are looked for. */
const REMINDER_TICK_MS = 30 * 1000;
/**
 * A reminder found later than this (the server was asleep or restarting) is
 * dropped: «حان وقت المجلس» an hour late is noise, not help.
 */
export const REMINDER_GRACE_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------- dates and times

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const hijriShort = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long' });

/** «الأحد ١٨ جمادى الأولى» — the same way the site's schedule names a day. */
export function dayName(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${hijriShort.format(d)}`;
}

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Minutes `tz` is ahead of UTC at the instant `utcMs`. */
function offsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

/** The instant a wall-clock time ("2026-11-08", "20:30") happens in `tz`. */
export function zonedTime(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  // Two passes settle the offset around daylight-saving changes.
  let utc = wall - offsetMinutes(wall, tz) * 60000;
  utc = wall - offsetMinutes(utc, tz) * 60000;
  return new Date(utc);
}

/** remindAt/remindedAt for a session; a changed date or time re-arms the reminder. */
export function reminderFields(s: { date: string; startTime: string | null; timeZone: string | null }) {
  const remindAt = s.startTime && s.timeZone ? zonedTime(s.date, s.startTime, s.timeZone) : null;
  return { remindAt, remindedAt: null };
}

// ---------------------------------------------------------------- «تحديث الجدول»

/** Changed days waiting to be announced, per manager. */
const pending = new Map<string, Set<string>>();
let changeTimer: NodeJS.Timeout | null = null;
let changeJob: Promise<void> = Promise.resolve();

/**
 * Records that `actorId` changed the sessions on `dates`. Days already in the
 * past are left out: nobody needs a popup because last week was tidied up.
 */
export function noteScheduleChange(actorId: string, dates: Iterable<string>): void {
  // Yesterday in UTC, so "today" is kept wherever the members live.
  const cutoff = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const upcoming = [...dates].filter((d) => d >= cutoff);
  if (!upcoming.length) return;

  const set = pending.get(actorId) ?? new Set<string>();
  for (const d of upcoming) set.add(d);
  pending.set(actorId, set);

  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = setTimeout(() => void flushScheduleChanges(), CHANGE_QUIET_MS);
  changeTimer.unref?.();
}

/** Sends what's pending now instead of after the quiet period (also used by tests). */
export function flushScheduleChanges(): Promise<void> {
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = null;
  const batch = [...pending];
  pending.clear();
  changeJob = changeJob.then(async () => {
    for (const [actorId, dates] of batch) {
      try {
        await announceChange(actorId, [...dates].sort());
      } catch (err) {
        console.error('[notifications] schedule_change', err);
      }
    }
  });
  return changeJob;
}

/** «فلان حدّث جدول الأحد ١٨ جمادى الأولى» / «… حدّث الجدول: الأحد …، الاثنين … و٣ أيام أخرى». */
export function changeSentence(actorName: string | null, dates: string[]): string {
  const who = actorName ?? 'أحد المشرفين';
  if (dates.length === 1) return `${who} حدّث جدول ${dayName(dates[0])}`;
  const shown = dates.slice(0, 3).map(dayName).join('، ');
  const more = dates.length - 3;
  return `${who} حدّث الجدول: ${shown}${more === 1 ? ' ويوم آخر' : more > 1 ? ` و${more} أيام أخرى` : ''}`;
}

async function announceChange(actorId: string, dates: string[]): Promise<void> {
  const [actor, users] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }),
    prisma.user.findMany({ where: { id: { not: actorId } }, select: { id: true } }),
  ]);
  if (!users.length) return;
  const userIds = users.map((u) => u.id);

  // One unread «تحديث الجدول» per person: a new burst folds the older unread one in.
  const unread = await prisma.notification.findMany({
    where: { type: 'schedule_change', userId: { in: userIds }, readAt: null },
    select: { id: true, userId: true, scheduleDates: true },
  });
  const earlier = new Map<string, string[]>();
  for (const n of unread) earlier.set(n.userId, [...(earlier.get(n.userId) ?? []), ...n.scheduleDates]);

  const rows = await prisma.$transaction(async (tx) => {
    if (unread.length) await tx.notification.deleteMany({ where: { id: { in: unread.map((n) => n.id) } } });
    return tx.notification.createManyAndReturn({
      data: userIds.map((userId) => ({
        type: 'schedule_change' as const,
        userId,
        actorId,
        scheduleDates: [...new Set([...(earlier.get(userId) ?? []), ...dates])].sort(),
      })),
      select: { id: true, userId: true, scheduleDates: true },
    });
  });

  pushToUsers(
    rows.map((n) => ({
      userId: n.userId,
      payload: {
        title: SITE_NAME,
        body: changeSentence(actor?.name ?? null, n.scheduleDates),
        url: `/?date=${n.scheduleDates[0]}&n=${n.id}#schedule`,
        tag: 'schedule_change',
      },
    })),
  );
}

// ---------------------------------------------------------------- «حان وقت المجلس»

export const REMINDER_TITLE = 'حان وقت المجلس';

/** «درس التفسير · القسم الأول · بعد العصر», then the manager's message (a verse, a hadith…) below it. */
export function reminderBody(s: { title: string; section: string | null; timeLabel: string; reminderMessage: string | null }): string {
  const line = [`«${s.title}»`, s.section, s.timeLabel].filter(Boolean).join(' · ');
  return s.reminderMessage ? `${line}
${s.reminderMessage}` : line;
}

/** Sends every reminder that has come due. Each session is claimed first, so it is never sent twice. */
export async function sendDueReminders(now = new Date()): Promise<number> {
  const due = await prisma.scheduleItem.findMany({
    where: { remindedAt: null, remindAt: { lte: now, gte: new Date(now.getTime() - REMINDER_GRACE_MS) } },
    orderBy: { remindAt: 'asc' },
    take: 50,
  });
  let sent = 0;
  for (const item of due) {
    const claimed = await prisma.scheduleItem.updateMany({
      where: { id: item.id, remindedAt: null, remindAt: item.remindAt },
      data: { remindedAt: now },
    });
    if (!claimed.count) continue;

    const users = await prisma.user.findMany({ select: { id: true } });
    if (!users.length) continue;
    const rows = await prisma.notification.createManyAndReturn({
      data: users.map((u) => ({ type: 'schedule_reminder' as const, userId: u.id, scheduleItemId: item.id })),
      select: { id: true, userId: true },
    });
    pushToUsers(
      rows.map((n) => ({
        userId: n.userId,
        payload: {
          title: REMINDER_TITLE,
          body: reminderBody(item),
          url: `/?date=${item.date}&n=${n.id}#schedule`,
          tag: `reminder:${item.id}`,
          ring: true,
        },
      })),
    );
    sent += 1;
  }
  return sent;
}

/** Starts the reminder timer (from index.ts, so tests drive sendDueReminders themselves). */
export function startScheduleReminders(): void {
  const tick = () => sendDueReminders().catch((err) => console.error('[notifications] schedule_reminder', err));
  void tick();
  setInterval(tick, REMINDER_TICK_MS).unref?.();
}

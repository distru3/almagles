import { prisma } from '../db.js';
import { pushToUsers } from './push.js';
import { zonedTime, isTimeZone } from './scheduleNotifications.js';

/**
 * Adhkar reminders:
 * Daily push notifications for morning, evening, and sleep adhkar.
 * Checked every 30s. Each user's local date/time is respected using their timeZone.
 */

export const ADHKAR_REMINDER_TICK_MS = 30 * 1000;
export const ADHKAR_REMINDER_GRACE_MS = 30 * 60 * 1000;

export const ADHKAR_NOTIFICATIONS = {
  morning: {
    type: 'adhkar_morning' as const,
    title: 'أذكار الصباح · رجال الأمة',
    body: 'أصبحنا وأصبح الملك لله. حان وقت أذكار الصباح لحفظك وبركة يومك.',
    url: '/adhkar?type=morning',
    tag: 'adhkar-morning',
  },
  evening: {
    type: 'adhkar_evening' as const,
    title: 'أذكار المساء · رجال الأمة',
    body: 'أمسينا وأمسى الملك لله. حان وقت أذكار المساء لتحصين نفسك وأهلك.',
    url: '/adhkar?type=evening',
    tag: 'adhkar-evening',
  },
  sleep: {
    type: 'adhkar_sleep' as const,
    title: 'أذكار النوم · رجال الأمة',
    body: 'رتل أذكارك بيقين، واختم يومك بذكر الله وتوكل عليه قبل النوم.',
    url: '/adhkar?type=sleep',
    tag: 'adhkar-sleep',
  },
} as const;

export function todayInTz(tz: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Sends all due adhkar reminders across all subscribed members. */
export async function sendDueAdhkarReminders(now = new Date()): Promise<number> {
  const active = await prisma.adhkarReminder.findMany({
    where: { enabled: true },
  });

  let sent = 0;

  for (const item of active) {
    const tz = isTimeZone(item.timeZone) ? item.timeZone : 'Asia/Riyadh';
    const userToday = todayInTz(tz, now);

    // 1. Morning
    if (item.morningEnabled && item.lastMorningDate !== userToday) {
      const targetUtc = zonedTime(userToday, item.morningTime, tz);
      const diff = now.getTime() - targetUtc.getTime();
      if (diff >= 0 && diff <= ADHKAR_REMINDER_GRACE_MS) {
        const claimed = await prisma.adhkarReminder.updateMany({
          where: {
            id: item.id,
            enabled: true,
            morningEnabled: true,
            OR: [{ lastMorningDate: null }, { lastMorningDate: { not: userToday } }],
          },
          data: { lastMorningDate: userToday },
        });

        if (claimed.count > 0) {
          const config = ADHKAR_NOTIFICATIONS.morning;
          const notif = await prisma.notification.create({
            data: { type: config.type, userId: item.userId },
            select: { id: true },
          });

          pushToUsers([
            {
              userId: item.userId,
              payload: {
                title: config.title,
                body: config.body,
                url: `${config.url}&n=${notif.id}`,
                tag: config.tag,
              },
            },
          ]);
          sent += 1;
        }
      }
    }

    // 2. Evening
    if (item.eveningEnabled && item.lastEveningDate !== userToday) {
      const targetUtc = zonedTime(userToday, item.eveningTime, tz);
      const diff = now.getTime() - targetUtc.getTime();
      if (diff >= 0 && diff <= ADHKAR_REMINDER_GRACE_MS) {
        const claimed = await prisma.adhkarReminder.updateMany({
          where: {
            id: item.id,
            enabled: true,
            eveningEnabled: true,
            OR: [{ lastEveningDate: null }, { lastEveningDate: { not: userToday } }],
          },
          data: { lastEveningDate: userToday },
        });

        if (claimed.count > 0) {
          const config = ADHKAR_NOTIFICATIONS.evening;
          const notif = await prisma.notification.create({
            data: { type: config.type, userId: item.userId },
            select: { id: true },
          });

          pushToUsers([
            {
              userId: item.userId,
              payload: {
                title: config.title,
                body: config.body,
                url: `${config.url}&n=${notif.id}`,
                tag: config.tag,
              },
            },
          ]);
          sent += 1;
        }
      }
    }

    // 3. Sleep
    if (item.sleepEnabled && item.lastSleepDate !== userToday) {
      const targetUtc = zonedTime(userToday, item.sleepTime, tz);
      const diff = now.getTime() - targetUtc.getTime();
      if (diff >= 0 && diff <= ADHKAR_REMINDER_GRACE_MS) {
        const claimed = await prisma.adhkarReminder.updateMany({
          where: {
            id: item.id,
            enabled: true,
            sleepEnabled: true,
            OR: [{ lastSleepDate: null }, { lastSleepDate: { not: userToday } }],
          },
          data: { lastSleepDate: userToday },
        });

        if (claimed.count > 0) {
          const config = ADHKAR_NOTIFICATIONS.sleep;
          const notif = await prisma.notification.create({
            data: { type: config.type, userId: item.userId },
            select: { id: true },
          });

          pushToUsers([
            {
              userId: item.userId,
              payload: {
                title: config.title,
                body: config.body,
                url: `${config.url}&n=${notif.id}`,
                tag: config.tag,
              },
            },
          ]);
          sent += 1;
        }
      }
    }
  }

  return sent;
}

/** Starts the reminder timer (from index.ts). */
export function startAdhkarReminders(): void {
  const tick = () => sendDueAdhkarReminders().catch((err) => console.error('[notifications] adhkar_reminder', err));
  void tick();
  setInterval(tick, ADHKAR_REMINDER_TICK_MS).unref?.();
}

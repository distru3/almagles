import { prisma } from '../db.js';
import { pushToUsers } from './push.js';
import { zonedTime, isTimeZone } from './scheduleNotifications.js';
import { isMethodId, prayerTimes, type PrayerPlace } from './prayerTimes.js';
import type { AdhkarTiming } from '@prisma/client';

/**
 * Adhkar reminders:
 * Daily push notifications for morning, evening, and sleep adhkar.
 * Checked every 30s. Each member's local date comes from their time zone, and
 * morning/evening follow the prayer times at their place (see reminderTimes).
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

type AdhkarKind = keyof typeof ADHKAR_NOTIFICATIONS;

/** The reminder fields the worker and the route need to work out today's times. */
export interface ReminderTiming {
  morningEnabled: boolean;
  morningTime: string;
  morningMode: AdhkarTiming;
  morningOffset: number;
  eveningEnabled: boolean;
  eveningTime: string;
  eveningMode: AdhkarTiming;
  eveningOffset: number;
  sleepEnabled: boolean;
  sleepTime: string;
  lat: number | null;
  lng: number | null;
  method: string | null;
}

export function reminderPlace(r: Pick<ReminderTiming, 'lat' | 'lng' | 'method'>): PrayerPlace | null {
  return r.lat != null && r.lng != null && isMethodId(r.method) ? { lat: r.lat, lng: r.lng, method: r.method } : null;
}

/**
 * When each reminder is due on the member's local date `day`. «أذكار الصباح» follows
 * Fajr and «أذكار المساء» follows Asr where the member is, so they never arrive
 * before the prayer — Casablanca's Fajr is an hour later than Riyadh's on the
 * clock. Without a known place, or when the member chose a clock time, the fixed
 * time in their time zone is used. «أذكار النوم» is always the member's own bedtime.
 */
export function reminderTimes(r: ReminderTiming, day: string, tz: string): Record<AdhkarKind, Date | null> {
  const place = reminderPlace(r);
  const prayers = place ? prayerTimes(day, place) : null;
  const after = (at: Date, minutes: number) => new Date(at.getTime() + minutes * 60_000);
  return {
    morning: !r.morningEnabled
      ? null
      : prayers && r.morningMode === 'prayer'
        ? after(prayers.fajr, r.morningOffset)
        : zonedTime(day, r.morningTime, tz),
    evening: !r.eveningEnabled
      ? null
      : prayers && r.eveningMode === 'prayer'
        ? after(prayers.asr, r.eveningOffset)
        : zonedTime(day, r.eveningTime, tz),
    sleep: r.sleepEnabled ? zonedTime(day, r.sleepTime, tz) : null,
  };
}

const LAST_SENT = {
  morning: 'lastMorningDate',
  evening: 'lastEveningDate',
  sleep: 'lastSleepDate',
} as const;

const ENABLED = {
  morning: 'morningEnabled',
  evening: 'eveningEnabled',
  sleep: 'sleepEnabled',
} as const;

/** Sends all due adhkar reminders across all subscribed members. */
export async function sendDueAdhkarReminders(now = new Date()): Promise<number> {
  const active = await prisma.adhkarReminder.findMany({
    where: { enabled: true },
  });

  let sent = 0;

  for (const item of active) {
    const tz = isTimeZone(item.timeZone) ? item.timeZone : 'Asia/Riyadh';
    const userToday = todayInTz(tz, now);
    const due = reminderTimes(item, userToday, tz);

    for (const kind of Object.keys(ADHKAR_NOTIFICATIONS) as AdhkarKind[]) {
      const target = due[kind];
      if (!target || item[LAST_SENT[kind]] === userToday) continue;
      const diff = now.getTime() - target.getTime();
      if (diff < 0 || diff > ADHKAR_REMINDER_GRACE_MS) continue;

      // Claim the day first so two overlapping ticks can't both send it.
      const lastSent = LAST_SENT[kind];
      const claimed = await prisma.adhkarReminder.updateMany({
        where: {
          id: item.id,
          enabled: true,
          [ENABLED[kind]]: true,
          OR: [{ [lastSent]: null }, { [lastSent]: { not: userToday } }],
        },
        data: { [lastSent]: userToday },
      });
      if (claimed.count === 0) continue;

      const config = ADHKAR_NOTIFICATIONS[kind];
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

  return sent;
}

/** Starts the reminder timer (from index.ts). */
export function startAdhkarReminders(): void {
  const tick = () => sendDueAdhkarReminders().catch((err) => console.error('[notifications] adhkar_reminder', err));
  void tick();
  setInterval(tick, ADHKAR_REMINDER_TICK_MS).unref?.();
}

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { isTimeZone } from '../lib/scheduleNotifications.js';
import { pushConfigured, pushToUserNow } from '../lib/push.js';
import { reminderPlace, wakeAdhkarReminders } from '../lib/adhkarNotifications.js';
import { METHOD_IDS } from '../lib/prayerTimes.js';
import type { AdhkarTiming, Prisma } from '@prisma/client';

const router = Router();

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = z.string().regex(timeRegex, 'تنسيق الوقت غير صالح (HH:MM)');
const offset = z.number().int().min(0, 'الدقائق بعد الصلاة غير صالحة').max(120, 'الدقائق بعد الصلاة غير صالحة');

/**
 * Where the member prays, from their browser. `guessed` means the device never
 * chose a city (it's a guess from the time zone), so it must not overwrite a
 * place the member chose on another device.
 */
const placeSchema = z.object({
  lat: z.number().min(-90, 'الموقع غير صالح').max(90, 'الموقع غير صالح'),
  lng: z.number().min(-180, 'الموقع غير صالح').max(180, 'الموقع غير صالح'),
  method: z.enum(METHOD_IDS, { message: 'طريقة الحساب غير معروفة' }),
  label: z.string().trim().max(80).optional(),
  guessed: z.boolean().optional(),
});

const prayerWard = z.object({
  enabled: z.boolean(),
  time,
  mode: z.enum(['prayer', 'fixed']).optional(),
  offset: offset.optional(),
});

const reminderPrefsSchema = z.object({
  enabled: z.boolean().optional(),
  timeZone: z.string().refine(isTimeZone, 'المنطقة الزمنية غير صالحة').optional(),
  place: placeSchema.optional(),
  morning: prayerWard.optional(),
  evening: prayerWard.optional(),
  sleep: z.object({ enabled: z.boolean(), time }).optional(),
});

type Place = z.infer<typeof placeSchema>;

const DEFAULT_SETTINGS = {
  enabled: false,
  timeZone: 'Asia/Riyadh',
  morningEnabled: true,
  morningTime: '06:00',
  morningMode: 'prayer' as AdhkarTiming,
  morningOffset: 20,
  eveningEnabled: true,
  eveningTime: '16:30',
  eveningMode: 'prayer' as AdhkarTiming,
  eveningOffset: 20,
  sleepEnabled: true,
  sleepTime: '22:30',
  lat: null as number | null,
  lng: null as number | null,
  method: null as string | null,
  placeLabel: null as string | null,
};

type Settings = typeof DEFAULT_SETTINGS;

function placeFields(place: Place) {
  return { lat: place.lat, lng: place.lng, method: place.method, placeLabel: place.label || null };
}

/** A chosen place always wins; a guessed one only fills in a place we don't have yet. */
function shouldStorePlace(place: Place | undefined, current: { lat: number | null } | null): place is Place {
  return !!place && (!place.guessed || !current || current.lat == null);
}

function serialize(row: Settings, hasPush: boolean) {
  const place = reminderPlace(row);
  return {
    enabled: row.enabled,
    timeZone: row.timeZone,
    place: place ? { ...place, label: row.placeLabel } : null,
    morning: { enabled: row.morningEnabled, time: row.morningTime, mode: row.morningMode, offset: row.morningOffset },
    evening: { enabled: row.eveningEnabled, time: row.eveningTime, mode: row.eveningMode, offset: row.eveningOffset },
    sleep: { enabled: row.sleepEnabled, time: row.sleepTime },
    hasPushSubscription: hasPush,
  };
}

/** GET carries the device's time zone and place in the query string. */
function placeFromQuery(q: Record<string, unknown>): Place | undefined {
  const parsed = placeSchema.safeParse({
    lat: Number(q.lat),
    lng: Number(q.lng),
    method: q.method,
    label: typeof q.label === 'string' ? q.label : undefined,
    guessed: q.guessed === '1',
  });
  return q.lat !== undefined && parsed.success ? parsed.data : undefined;
}

router.get('/reminders', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const clientTz = typeof req.query.tz === 'string' && isTimeZone(req.query.tz) ? req.query.tz : null;
    const clientPlace = placeFromQuery(req.query);

    const [row, pushCount] = await Promise.all([
      prisma.adhkarReminder.findUnique({ where: { userId } }),
      prisma.pushSubscription.count({ where: { userId } }),
    ]);

    if (row) {
      // Keep the stored time zone and place in step with the device the member is using now.
      const data: Prisma.AdhkarReminderUpdateInput = {};
      if (clientTz && row.timeZone !== clientTz) data.timeZone = clientTz;
      if (shouldStorePlace(clientPlace, row)) {
        const p = placeFields(clientPlace);
        if (p.lat !== row.lat || p.lng !== row.lng || p.method !== row.method || p.placeLabel !== row.placeLabel) Object.assign(data, p);
      }
      const current = Object.keys(data).length ? await prisma.adhkarReminder.update({ where: { userId }, data }) : row;
      // A new zone or place moves the prayer-based times.
      if (current !== row) wakeAdhkarReminders();
      return res.json(serialize(current, pushCount > 0));
    }

    const initial: Settings = {
      ...DEFAULT_SETTINGS,
      timeZone: clientTz ?? 'Asia/Riyadh',
      ...(clientPlace ? placeFields(clientPlace) : {}),
    };
    return res.json(serialize(initial, pushCount > 0));
  } catch (err) {
    next(err);
  }
});

router.put('/reminders', requireAuth, validate(reminderPrefsSchema), async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const body = req.body as z.infer<typeof reminderPrefsSchema>;
    const existing = await prisma.adhkarReminder.findUnique({ where: { userId }, select: { lat: true } });

    const data: Partial<Settings> = {};
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.timeZone) data.timeZone = body.timeZone;
    if (shouldStorePlace(body.place, existing)) Object.assign(data, placeFields(body.place));
    if (body.morning) {
      data.morningEnabled = body.morning.enabled;
      data.morningTime = body.morning.time;
      if (body.morning.mode) data.morningMode = body.morning.mode;
      if (body.morning.offset !== undefined) data.morningOffset = body.morning.offset;
    }
    if (body.evening) {
      data.eveningEnabled = body.evening.enabled;
      data.eveningTime = body.evening.time;
      if (body.evening.mode) data.eveningMode = body.evening.mode;
      if (body.evening.offset !== undefined) data.eveningOffset = body.evening.offset;
    }
    if (body.sleep) {
      data.sleepEnabled = body.sleep.enabled;
      data.sleepTime = body.sleep.time;
    }

    const row = await prisma.adhkarReminder.upsert({
      where: { userId },
      update: data,
      create: { ...DEFAULT_SETTINGS, ...data, userId },
    });
    wakeAdhkarReminders();

    const pushCount = await prisma.pushSubscription.count({ where: { userId } });
    return res.json(serialize(row, pushCount > 0));
  } catch (err) {
    next(err);
  }
});

router.post('/reminders/test', requireAuth, async (req, res, next) => {
  try {
    if (!pushConfigured()) {
      return res.status(503).json({ message: 'الإشعارات غير مفعّلة على الخادم' });
    }

    const report = await pushToUserNow(req.user!.id, {
      title: 'تنبيه الأذكار التجريبي · رجال الأمة',
      body: 'تم تفعيل التنبيهات بنجاح. ستصلك إشعارات الأذكار في مواعيدها المحددة ✓',
      url: '/adhkar',
      tag: 'adhkar-test',
    });

    return res.json(report);
  } catch (err) {
    next(err);
  }
});

export default router;

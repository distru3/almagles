import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { isTimeZone } from '../lib/scheduleNotifications.js';
import { pushConfigured, pushToUserNow } from '../lib/push.js';

const router = Router();

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const reminderPrefsSchema = z.object({
  enabled: z.boolean(),
  timeZone: z.string().refine(isTimeZone, 'المنطقة الزمنية غير صالحة').optional(),
  morning: z
    .object({
      enabled: z.boolean(),
      time: z.string().regex(timeRegex, 'تنسيق الوقت غير صالح (HH:MM)'),
    })
    .optional(),
  evening: z
    .object({
      enabled: z.boolean(),
      time: z.string().regex(timeRegex, 'تنسيق الوقت غير صالح (HH:MM)'),
    })
    .optional(),
  sleep: z
    .object({
      enabled: z.boolean(),
      time: z.string().regex(timeRegex, 'تنسيق الوقت غير صالح (HH:MM)'),
    })
    .optional(),
});

function serialize(row: {
  enabled: boolean;
  timeZone: string;
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  sleepEnabled: boolean;
  sleepTime: string;
}, hasPush: boolean) {
  return {
    enabled: row.enabled,
    timeZone: row.timeZone,
    morning: { enabled: row.morningEnabled, time: row.morningTime },
    evening: { enabled: row.eveningEnabled, time: row.eveningTime },
    sleep: { enabled: row.sleepEnabled, time: row.sleepTime },
    hasPushSubscription: hasPush,
  };
}

const DEFAULT_SETTINGS = {
  enabled: false,
  timeZone: 'Asia/Riyadh',
  morningEnabled: true,
  morningTime: '06:00',
  eveningEnabled: true,
  eveningTime: '16:30',
  sleepEnabled: true,
  sleepTime: '22:30',
};

router.get('/reminders', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const clientTz = typeof req.query.tz === 'string' && isTimeZone(req.query.tz) ? req.query.tz : null;

    const [row, pushCount] = await Promise.all([
      prisma.adhkarReminder.findUnique({ where: { userId } }),
      prisma.pushSubscription.count({ where: { userId } }),
    ]);

    if (row) {
      if (clientTz && row.timeZone !== clientTz) {
        await prisma.adhkarReminder.update({ where: { userId }, data: { timeZone: clientTz } });
        row.timeZone = clientTz;
      }
      return res.json(serialize(row, pushCount > 0));
    }

    const initial = { ...DEFAULT_SETTINGS, timeZone: clientTz ?? 'Asia/Riyadh' };
    return res.json(serialize(initial, pushCount > 0));
  } catch (err) {
    next(err);
  }
});

router.put('/reminders', requireAuth, validate(reminderPrefsSchema), async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const body = req.body as z.infer<typeof reminderPrefsSchema>;

    const updateData: {
      enabled: boolean;
      timeZone?: string;
      morningEnabled?: boolean;
      morningTime?: string;
      eveningEnabled?: boolean;
      eveningTime?: string;
      sleepEnabled?: boolean;
      sleepTime?: string;
    } = {
      enabled: body.enabled,
    };

    if (body.timeZone) updateData.timeZone = body.timeZone;
    if (body.morning) {
      updateData.morningEnabled = body.morning.enabled;
      updateData.morningTime = body.morning.time;
    }
    if (body.evening) {
      updateData.eveningEnabled = body.evening.enabled;
      updateData.eveningTime = body.evening.time;
    }
    if (body.sleep) {
      updateData.sleepEnabled = body.sleep.enabled;
      updateData.sleepTime = body.sleep.time;
    }

    const row = await prisma.adhkarReminder.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        enabled: body.enabled,
        timeZone: body.timeZone ?? 'Asia/Riyadh',
        morningEnabled: body.morning?.enabled ?? true,
        morningTime: body.morning?.time ?? '06:00',
        eveningEnabled: body.evening?.enabled ?? true,
        eveningTime: body.evening?.time ?? '16:30',
        sleepEnabled: body.sleep?.enabled ?? true,
        sleepTime: body.sleep?.time ?? '22:30',
      },
    });

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

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { pushConfigured, pushToUserNow } from '../lib/push.js';

const router = Router();

/**
 * The server POSTs to whatever endpoint a browser registers, so only the real
 * push services are accepted (Chrome/Android, Firefox, Safari/iOS, Edge/Windows);
 * anything else could aim the server at internal addresses.
 */
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

export function isPushEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

const endpoint = z.string().max(2000).refine(isPushEndpoint, 'عنوان خدمة الإشعارات غير مدعوم');
const key = z.string().min(1).max(200);

const subscribeSchema = z.object({
  endpoint,
  keys: z.object({ p256dh: key, auth: key }),
});

/** The key browsers need to subscribe; null while push isn't configured on the server. */
router.get('/public-key', (_req, res) => {
  res.json({ publicKey: pushConfigured() ? env.VAPID_PUBLIC_KEY : null });
});

router.post('/subscribe', requireAuth, validate(subscribeSchema), async (req, res, next) => {
  try {
    if (!pushConfigured()) return res.status(503).json({ message: 'الإشعارات غير مفعّلة على الخادم' });
    const { endpoint, keys } = req.body as z.infer<typeof subscribeSchema>;
    const userId = req.user!.id;
    // One device belongs to whoever is signed in on it now.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth },
      create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
    return res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const unsubscribeSchema = z.object({ endpoint: z.string().min(1).max(2000) });

router.post('/unsubscribe', requireAuth, validate(unsubscribeSchema), async (req, res, next) => {
  try {
    const { endpoint } = req.body as z.infer<typeof unsubscribeSchema>;
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.id } });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Sends a test popup to all of the signed-in user's devices and says what each
 * push service answered, so a phone that gets nothing can be diagnosed.
 */
router.post('/test', requireAuth, async (req, res, next) => {
  try {
    if (!pushConfigured()) return res.status(503).json({ message: 'الإشعارات غير مفعّلة على الخادم' });
    const report = await pushToUserNow(req.user!.id, {
      title: 'رجال الأمة',
      body: 'إشعار تجريبي — الإشعارات تعمل على هذا الجهاز ✓',
      url: '/notifications',
      tag: 'test',
    });
    return res.json(report);
  } catch (err) {
    next(err);
  }
});

export default router;

import { sendNotification, WebPushError } from 'web-push';
import type { PushSubscription as WebPushSubscription, RequestOptions } from 'web-push';
import { prisma } from '../db.js';
import { env } from '../env.js';

/** What the service worker (client/public/sw.js) receives and shows. */
export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the popup is tapped (carries ?n=<notification id> so the site marks it read). */
  url: string;
  /** A newer popup with the same tag replaces the older one instead of stacking. */
  tag: string;
}

/** Push is off until both VAPID keys are configured. */
export function pushConfigured(): boolean {
  return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

/** Swappable so tests can capture pushes instead of calling Google/Apple/Mozilla. */
export const pushTransport = {
  send: (subscription: WebPushSubscription, payload: string, options: RequestOptions) =>
    sendNotification(subscription, payload, options) as Promise<unknown>,
};

/** Sends to this many devices at a time, so a new post to every member doesn't open hundreds of connections. */
const BATCH = 20;

const inFlight = new Set<Promise<void>>();

/** Waits for pushes still being sent (used by tests). */
export async function flushPushes(): Promise<void> {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

/** Which push service an endpoint belongs to, for logs and the test report. */
export function pushService(endpoint: string): string {
  const host = (() => {
    try {
      return new URL(endpoint).hostname;
    } catch {
      return '';
    }
  })();
  if (host.endsWith('push.apple.com')) return 'apple';
  if (host.endsWith('googleapis.com')) return 'google';
  if (host.endsWith('mozilla.com')) return 'mozilla';
  if (host.endsWith('notify.windows.com')) return 'microsoft';
  return host || 'unknown';
}

export interface DeliveryReport {
  devices: number;
  sent: number;
  /** Devices the push service refused, with its reason (e.g. Apple's BadJwtToken). */
  failures: { service: string; status: number | null; reason: string }[];
}

async function deliver(messages: { userId: string; payload: PushPayload }[]): Promise<DeliveryReport> {
  const payloads = new Map(messages.map((m) => [m.userId, JSON.stringify(m.payload)]));
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: [...payloads.keys()] } } });
  const report: DeliveryReport = { devices: subscriptions.length, sent: 0, failures: [] };
  if (!subscriptions.length) return report;

  const options: RequestOptions = {
    vapidDetails: { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! },
    // Worth delivering for a day if the phone is off; after that it's stale.
    TTL: 24 * 60 * 60,
    urgency: 'high',
    timeout: 10_000,
  };
  const gone: string[] = [];

  for (let i = 0; i < subscriptions.length; i += BATCH) {
    await Promise.all(
      subscriptions.slice(i, i + BATCH).map(async (s) => {
        try {
          await pushTransport.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payloads.get(s.userId)!, options);
          report.sent += 1;
        } catch (err) {
          const service = pushService(s.endpoint);
          const status = err instanceof WebPushError ? err.statusCode : null;
          // The push services explain refusals in the body, e.g. Apple: {"reason":"BadJwtToken"}.
          const reason = (err instanceof WebPushError ? String(err.body ?? '').trim() : '') || (err instanceof Error ? err.message : String(err));
          report.failures.push({ service, status, reason: reason.slice(0, 300) });
          // 404/410: the app was uninstalled or notifications were turned off; stop sending there.
          if (status === 404 || status === 410) gone.push(s.id);
          else console.error(`[push] ${service} refused (${status ?? 'no status'}): ${reason}`);
        }
      }),
    );
  }
  if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  return report;
}

/** Sends to one user's devices and waits, so the caller can report what happened (the test button). */
export function pushToUserNow(userId: string, payload: PushPayload): Promise<DeliveryReport> {
  return deliver([{ userId, payload }]);
}

/**
 * Sends each user's popup to every device they turned notifications on for.
 * Runs in the background: the request that caused it doesn't wait for the push services.
 */
export function pushToUsers(messages: { userId: string; payload: PushPayload }[]): void {
  if (!pushConfigured() || !messages.length) return;
  const job = deliver(messages)
    .then(() => undefined)
    .catch((err) => console.error('[push]', err))
    .finally(() => inFlight.delete(job));
  inFlight.add(job);
}

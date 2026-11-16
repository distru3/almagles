import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { flushPushes, pushTransport } from '../src/lib/push.js';
import {
  ADHKAR_REMINDER_GRACE_MS,
  sendDueAdhkarReminders,
  todayInTz,
} from '../src/lib/adhkarNotifications.js';
import { zonedTime } from '../src/lib/scheduleNotifications.js';

const realSend = pushTransport.send;
let sent: { endpoint: string; payload: any }[] = [];

beforeEach(async () => {
  await flushPushes();
  await resetDb();
  sent = [];
  pushTransport.send = async (sub, payload) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    return {};
  };
});

afterEach(() => {
  pushTransport.send = realSend;
});

const KEYS = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};

async function member(email: string) {
  await createUser({ email, name: 'أحمد' });
  const c = await loginAs(email);
  await c.post('/api/push/subscribe', {
    endpoint: `https://fcm.googleapis.com/fcm/send/${email}`,
    keys: KEYS,
  });
  return c;
}

describe('adhkar reminders endpoints', () => {
  it('returns default reminders for a newly registered member', async () => {
    const c = await member('user1@test.local');
    const res = await c.get('/api/adhkar/reminders');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      enabled: false,
      morning: { enabled: true, time: '06:00' },
      evening: { enabled: true, time: '16:30' },
      sleep: { enabled: true, time: '22:30' },
      hasPushSubscription: true,
    });
  });

  it('updates reminder preferences and saves them to database', async () => {
    const c = await member('user2@test.local');
    const updateRes = await c.put('/api/adhkar/reminders', {
      enabled: true,
      timeZone: 'Asia/Riyadh',
      morning: { enabled: true, time: '05:30' },
      evening: { enabled: false, time: '17:00' },
      sleep: { enabled: true, time: '23:00' },
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body).toMatchObject({
      enabled: true,
      timeZone: 'Asia/Riyadh',
      morning: { enabled: true, time: '05:30' },
      evening: { enabled: false, time: '17:00' },
      sleep: { enabled: true, time: '23:00' },
    });

    // Check GET returns the updated settings
    const getRes = await c.get('/api/adhkar/reminders');
    expect(getRes.body).toMatchObject({
      enabled: true,
      morning: { enabled: true, time: '05:30' },
      evening: { enabled: false, time: '17:00' },
      sleep: { enabled: true, time: '23:00' },
    });
  });

  it('sends a test push notification to user devices', async () => {
    const c = await member('user3@test.local');
    const res = await c.post('/api/adhkar/reminders/test');
    expect(res.status).toBe(200);
    expect(res.body.devices).toBe(1);
    expect(res.body.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.title).toContain('تنبيه الأذكار التجريبي');
    expect(sent[0].payload.tag).toBe('adhkar-test');
  });
});

describe('sendDueAdhkarReminders worker', () => {
  it('sends morning adhkar when due, creates in-app notification and web push', async () => {
    const c = await member('user4@test.local');
    await c.put('/api/adhkar/reminders', {
      enabled: true,
      timeZone: 'Asia/Riyadh',
      morning: { enabled: true, time: '06:00' },
      evening: { enabled: true, time: '16:30' },
      sleep: { enabled: true, time: '22:30' },
    });

    const today = todayInTz('Asia/Riyadh');
    // Simulated instant: exactly 06:05 in Riyadh
    const now = new Date(zonedTime(today, '06:00', 'Asia/Riyadh').getTime() + 5 * 60 * 1000);

    const sentCount = await sendDueAdhkarReminders(now);
    expect(sentCount).toBe(1);

    await flushPushes();
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.title).toContain('أذكار الصباح');
    expect(sent[0].payload.tag).toBe('adhkar-morning');

    // In-app notification created
    const notifs = (await c.get('/api/notifications')).body.notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('adhkar_morning');

    // Running again does not duplicate
    const sentAgain = await sendDueAdhkarReminders(now);
    expect(sentAgain).toBe(0);
  });

  it('drops reminder if found past grace period (e.g. server was off for hours)', async () => {
    const c = await member('user5@test.local');
    await c.put('/api/adhkar/reminders', {
      enabled: true,
      timeZone: 'Asia/Riyadh',
      morning: { enabled: true, time: '06:00' },
    });

    const today = todayInTz('Asia/Riyadh');
    // Simulated instant: 2 hours after 06:00 (past 30 min grace period)
    const tooLate = new Date(zonedTime(today, '06:00', 'Asia/Riyadh').getTime() + ADHKAR_REMINDER_GRACE_MS + 60 * 1000);

    const sentCount = await sendDueAdhkarReminders(tooLate);
    expect(sentCount).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

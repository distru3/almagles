import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { flushPushes, pushTransport } from '../src/lib/push.js';
import {
  ADHKAR_REMINDER_GRACE_MS,
  runAdhkarReminders,
  sendDueAdhkarReminders,
  todayInTz,
} from '../src/lib/adhkarNotifications.js';
import { zonedTime } from '../src/lib/scheduleNotifications.js';
import { prayerTimes } from '../src/lib/prayerTimes.js';

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

  it('automatically adopts and syncs client device timezone passed in query', async () => {
    const c = await member('user_tz@test.local');
    // Initially gets default with query tz
    const res1 = await c.get('/api/adhkar/reminders?tz=Africa/Cairo');
    expect(res1.body.timeZone).toBe('Africa/Cairo');

    // Stored settings get auto-updated when visiting from another timezone (e.g. travel or new device)
    await c.put('/api/adhkar/reminders', {
      enabled: true,
      timeZone: 'Asia/Riyadh',
    });
    const res2 = await c.get('/api/adhkar/reminders?tz=Africa/Cairo');
    expect(res2.body.timeZone).toBe('Africa/Cairo');

    const inDb = await prisma.adhkarReminder.findFirst({ where: { user: { email: 'user_tz@test.local' } } });
    expect(inDb?.timeZone).toBe('Africa/Cairo');
  });
});

describe('sendDueAdhkarReminders worker', () => {
  it('says when the next reminder falls — later today, then tomorrow morning', async () => {
    const c = await member('next@test.local');
    await c.put('/api/adhkar/reminders', {
      enabled: true,
      timeZone: 'UTC',
      morning: { enabled: true, time: '06:00', mode: 'fixed' },
      evening: { enabled: true, time: '16:30', mode: 'fixed' },
      sleep: { enabled: false, time: '22:30' },
    });

    expect(await runAdhkarReminders(new Date('2026-12-01T05:00:00Z'))).toEqual({ sent: 0, next: new Date('2026-12-01T06:00:00Z') });
    expect(await runAdhkarReminders(new Date('2026-12-01T06:00:10Z'))).toEqual({ sent: 1, next: new Date('2026-12-01T16:30:00Z') });
    expect(await runAdhkarReminders(new Date('2026-12-01T16:30:10Z'))).toEqual({ sent: 1, next: new Date('2026-12-02T06:00:00Z') });
  });

  it('waits for nothing when no member has reminders on', async () => {
    await member('off@test.local');
    expect(await runAdhkarReminders(new Date('2026-12-01T05:00:00Z'))).toEqual({ sent: 0, next: null });
  });

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

  it('delivers reminders according to each member’s own local timezone', async () => {
    // Member A in Riyadh (UTC+3), Member B in Cairo (UTC+2)
    const riyadhMember = await member('riyadh@test.local');
    await riyadhMember.put('/api/adhkar/reminders', {
      enabled: true,
      timeZone: 'Asia/Riyadh',
      morning: { enabled: true, time: '06:00' },
    });

    const cairoMember = await member('cairo@test.local');
    await cairoMember.put('/api/adhkar/reminders', {
      enabled: true,
      timeZone: 'Africa/Cairo',
      morning: { enabled: true, time: '06:00' },
    });

    // Instant 1: 03:00 UTC -> 06:00 in Riyadh, but 05:00 in Cairo
    const at0300Utc = new Date('2026-11-17T03:00:00.000Z');
    const sentRiyadh = await sendDueAdhkarReminders(at0300Utc);
    expect(sentRiyadh).toBe(1);

    await flushPushes();
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toContain('riyadh@test.local');

    // Instant 2: 04:00 UTC -> 07:00 in Riyadh (already sent), 06:00 in Cairo (due now)
    sent = [];
    const at0400Utc = new Date('2026-11-17T04:00:00.000Z');
    const sentCairo = await sendDueAdhkarReminders(at0400Utc);
    expect(sentCairo).toBe(1);

    await flushPushes();
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toContain('cairo@test.local');
  });
});

describe('prayer-based adhkar reminders', () => {
  const CASABLANCA = { lat: 33.5731, lng: -7.5898, method: 'morocco', label: 'الدار البيضاء، المغرب' };
  const CAIRO = { lat: 30.0444, lng: 31.2357, method: 'egypt', label: 'القاهرة، مصر' };
  const DAY = '2026-11-20';

  it('works out Fajr and Asr for the member’s city', () => {
    const casa = prayerTimes(DAY, { lat: CASABLANCA.lat, lng: CASABLANCA.lng, method: 'morocco' });
    const cairo = prayerTimes(DAY, { lat: CAIRO.lat, lng: CAIRO.lng, method: 'egypt' });
    // Published timetables give Casablanca 06:35/16:00 (UTC+1) and Cairo 04:53/14:38 (UTC+2), within a few minutes.
    const near = (d: Date, iso: string) => expect(Math.abs(d.getTime() - new Date(iso).getTime())).toBeLessThanOrEqual(6 * 60_000);
    near(casa.fajr, `${DAY}T05:35:00Z`);
    near(casa.asr, `${DAY}T15:02:00Z`);
    near(cairo.fajr, `${DAY}T02:53:00Z`);
    near(cairo.asr, `${DAY}T12:38:00Z`);
  });

  it('sends morning adhkar after Fajr where the member is, not at a fixed clock time', async () => {
    const c = await member('casa@test.local');
    const res = await c.put('/api/adhkar/reminders', {
      enabled: true,
      timeZone: 'Africa/Casablanca',
      place: CASABLANCA,
      morning: { enabled: true, time: '06:00', mode: 'prayer', offset: 20 },
    });
    expect(res.status).toBe(200);
    expect(res.body.place).toMatchObject({ lat: CASABLANCA.lat, method: 'morocco', label: CASABLANCA.label });
    expect(res.body.morning).toMatchObject({ mode: 'prayer', offset: 20 });

    const fajr = prayerTimes(DAY, { lat: CASABLANCA.lat, lng: CASABLANCA.lng, method: 'morocco' }).fajr;

    // 06:00 on the clock is before Fajr in Casablanca in November — nothing yet.
    expect(await sendDueAdhkarReminders(zonedTime(DAY, '06:00', 'Africa/Casablanca'))).toBe(0);
    // Fajr itself, but the member asked for 20 minutes after it.
    expect(await sendDueAdhkarReminders(new Date(fajr.getTime() + 10 * 60_000))).toBe(0);
    expect(await sendDueAdhkarReminders(new Date(fajr.getTime() + 21 * 60_000))).toBe(1);

    await flushPushes();
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.tag).toBe('adhkar-morning');
  });

  it('sends evening adhkar after Asr where the member is', async () => {
    const c = await member('cairo-asr@test.local');
    await c.put('/api/adhkar/reminders', {
      enabled: true,
      timeZone: 'Africa/Cairo',
      place: CAIRO,
      morning: { enabled: false, time: '06:00' },
      evening: { enabled: true, time: '16:30', mode: 'prayer', offset: 0 },
      sleep: { enabled: false, time: '22:30' },
    });
    const asr = prayerTimes(DAY, { lat: CAIRO.lat, lng: CAIRO.lng, method: 'egypt' }).asr;
    expect(await sendDueAdhkarReminders(new Date(asr.getTime() - 60_000))).toBe(0);
    expect(await sendDueAdhkarReminders(new Date(asr.getTime() + 60_000))).toBe(1);
    await flushPushes();
    expect(sent[0].payload.tag).toBe('adhkar-evening');
  });

  it('keeps a fixed clock time when the member chooses one', async () => {
    const c = await member('fixed@test.local');
    await c.put('/api/adhkar/reminders', {
      enabled: true,
      timeZone: 'Africa/Casablanca',
      place: CASABLANCA,
      morning: { enabled: true, time: '07:30', mode: 'fixed' },
    });
    expect(await sendDueAdhkarReminders(zonedTime(DAY, '07:31', 'Africa/Casablanca'))).toBe(1);
  });

  it('does not let a guessed place overwrite the city the member chose', async () => {
    const c = await member('guess@test.local');
    await c.put('/api/adhkar/reminders', { enabled: true, place: CASABLANCA });

    // Another device with no city chosen guesses Cairo from its time zone.
    const q = `lat=${CAIRO.lat}&lng=${CAIRO.lng}&method=egypt&guessed=1`;
    const res = await c.get(`/api/adhkar/reminders?${q}`);
    expect(res.body.place).toMatchObject({ lat: CASABLANCA.lat, method: 'morocco' });

    // Choosing a city on that device does move the reminders.
    const chosen = await c.get(`/api/adhkar/reminders?lat=${CAIRO.lat}&lng=${CAIRO.lng}&method=egypt`);
    expect(chosen.body.place).toMatchObject({ lat: CAIRO.lat, method: 'egypt' });
  });

  it('rejects an impossible place or offset', async () => {
    const c = await member('bad@test.local');
    const badPlace = await c.put('/api/adhkar/reminders', { place: { lat: 120, lng: 0, method: 'egypt' } });
    expect(badPlace.status).toBe(400);
    const badMethod = await c.put('/api/adhkar/reminders', { place: { lat: 30, lng: 31, method: 'nowhere' } });
    expect(badMethod.status).toBe(400);
    const badOffset = await c.put('/api/adhkar/reminders', { morning: { enabled: true, time: '06:00', offset: 500 } });
    expect(badOffset.status).toBe(400);
  });
});

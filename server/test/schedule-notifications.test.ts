import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUser, loginAs, prisma, resetDb } from './helpers.js';
import { flushPushes, pushTransport } from '../src/lib/push.js';
import {
  changeSentence,
  flushScheduleChanges,
  REMINDER_GRACE_MS,
  sendDueReminders,
  zonedTime,
} from '../src/lib/scheduleNotifications.js';

const realSend = pushTransport.send;
let sent: { endpoint: string; payload: any }[] = [];

beforeEach(async () => {
  // Drop changes other test files queued before their users were wiped.
  await flushScheduleChanges();
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

const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

async function member(email: string) {
  await createUser({ email });
  const c = await loginAs(email);
  await c.post('/api/push/subscribe', { endpoint: `https://fcm.googleapis.com/fcm/send/${email}`, keys: KEYS });
  return c;
}

async function manager() {
  await createUser({ email: 'm@test.local', role: 'admin', name: 'المشرف' });
  return loginAs('m@test.local');
}

const inbox = async (c: Awaited<ReturnType<typeof loginAs>>) => (await c.get('/api/notifications')).body;

/** A date a few days ahead, so it is never "in the past". */
const soon = (days = 3) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('zonedTime', () => {
  it('reads the time in the given zone, across daylight saving', () => {
    expect(zonedTime('2026-11-08', '20:30', 'UTC').toISOString()).toBe('2026-11-08T20:30:00.000Z');
    expect(zonedTime('2026-11-08', '20:30', 'Asia/Riyadh').toISOString()).toBe('2026-11-08T17:30:00.000Z');
    // Paris is UTC+2 in July and UTC+1 in November.
    expect(zonedTime('2026-07-01', '09:00', 'Europe/Paris').toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(zonedTime('2026-11-08', '09:00', 'Europe/Paris').toISOString()).toBe('2026-11-08T08:00:00.000Z');
  });
});

describe('«تحديث الجدول»', () => {
  it('a burst of edits sends one notification per member, listing the days, and not to the editor', async () => {
    const v = await member('v@test.local');
    const m = await manager();
    const a = (await m.post('/api/schedule', { date: soon(3), title: 'أ' })).body.item;
    await m.post('/api/schedule', { date: soon(4), title: 'ب' });
    await m.put(`/api/schedule/${a.id}`, { title: 'أ (معدّل)' });
    await flushScheduleChanges();
    await flushPushes();

    const body = await inbox(v);
    expect(body.unreadCount).toBe(1);
    expect(body.notifications[0]).toMatchObject({
      type: 'schedule_change',
      post: null,
      actor: { name: 'المشرف' },
      scheduleDates: [soon(3), soon(4)],
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ tag: 'schedule_change', body: changeSentence('المشرف', [soon(3), soon(4)]) });
    expect(sent[0].payload.url).toContain(`/?date=${soon(3)}&n=`);
    expect((await inbox(m)).unreadCount).toBe(0);
  });

  it('folds a new burst into the unread one instead of piling up', async () => {
    const v = await member('v@test.local');
    const m = await manager();
    await m.post('/api/schedule', { date: soon(3), title: 'أ' });
    await flushScheduleChanges();
    await m.post('/api/schedule', { date: soon(5), title: 'ب' });
    await flushScheduleChanges();

    const body = await inbox(v);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].scheduleDates).toEqual([soon(3), soon(5)]);
  });

  it('deleting sessions or a week counts; tidying past days does not', async () => {
    const v = await member('v@test.local');
    const m = await manager();
    const item = await prisma.scheduleItem.create({ data: { date: soon(2), weekdayKey: 'sat', timeLabel: '', title: 'أ' } });
    await prisma.scheduleItem.create({ data: { date: '2020-01-04', weekdayKey: 'sat', timeLabel: '', title: 'قديم' } });
    await m.del(`/api/schedule/${item.id}`);
    await m.del('/api/schedule/week/2020-01-04');
    await flushScheduleChanges();

    const body = await inbox(v);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].scheduleDates).toEqual([soon(2)]);
  });
});

describe('«حان وقت المجلس»', () => {
  it('stores the reminder instant from the time and zone, and clears it with the time', async () => {
    const m = await manager();
    const item = (await m.post('/api/schedule', { date: '2026-12-01', title: 'درس', startTime: '20:30', timeZone: 'Asia/Riyadh' })).body.item;
    expect(item).toMatchObject({ startTime: '20:30', timeZone: 'Asia/Riyadh', remindAt: '2026-12-01T17:30:00.000Z' });

    // Editing the title from another zone keeps the time where it was.
    const renamed = (await m.put(`/api/schedule/${item.id}`, { title: 'درس ٢', timeZone: 'Europe/Paris' })).body.item;
    expect(renamed).toMatchObject({ timeZone: 'Asia/Riyadh', remindAt: '2026-12-01T17:30:00.000Z' });

    const moved = (await m.put(`/api/schedule/${item.id}`, { date: '2026-12-02' })).body.item;
    expect(moved.remindAt).toBe('2026-12-02T17:30:00.000Z');

    const cleared = (await m.put(`/api/schedule/${item.id}`, { startTime: '' })).body.item;
    expect(cleared).toMatchObject({ startTime: null, timeZone: null, remindAt: null });
  });

  it('rejects a reminder message over 500 characters and stores an empty one as none', async () => {
    const m = await manager();
    expect((await m.post('/api/schedule', { date: soon(), title: 'د', reminderMessage: 'ا'.repeat(501) })).status).toBe(400);
    expect((await m.post('/api/schedule', { date: soon(), title: 'د', reminderMessage: '  ' })).body.item.reminderMessage).toBeNull();
  });

  it('rejects a bad time or zone, and a time without a zone', async () => {
    const m = await manager();
    expect((await m.post('/api/schedule', { date: soon(), title: 'د', startTime: '25:00', timeZone: 'UTC' })).status).toBe(400);
    expect((await m.post('/api/schedule', { date: soon(), title: 'د', startTime: '20:00', timeZone: 'Mars/Base' })).status).toBe(400);
    expect((await m.post('/api/schedule', { date: soon(), title: 'د', startTime: '20:00' })).status).toBe(400);
  });

  it('rings everyone once when the time comes, and again only if the time is changed', async () => {
    const v = await member('v@test.local');
    const m = await manager();
    const message = '﴿وَإِن تَتَوَلَّوْا يَسْتَبْدِلْ قَوْمًا غَيْرَكُمْ ثُمَّ لَا يَكُونُوا أَمْثَالَكُم﴾ [محمد: 38]';
    const item = (
      await m.post('/api/schedule', { date: '2026-12-01', title: 'درس التفسير', section: 'القسم الأول', startTime: '20:30', timeZone: 'UTC', reminderMessage: message })
    ).body.item;
    await flushScheduleChanges();
    await flushPushes();
    sent = [];

    expect(await sendDueReminders(new Date('2026-12-01T20:29:00Z'))).toBe(0);
    expect(await sendDueReminders(new Date('2026-12-01T20:30:10Z'))).toBe(1);
    expect(await sendDueReminders(new Date('2026-12-01T20:31:00Z'))).toBe(0);
    await flushPushes();

    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ title: 'حان وقت المجلس', body: `«درس التفسير» · القسم الأول
${message}`, ring: true, tag: `reminder:${item.id}` });
    const forV = await inbox(v);
    expect(forV.notifications.find((n: any) => n.type === 'schedule_reminder')).toMatchObject({
      post: null,
      scheduleItem: { id: item.id, title: 'درس التفسير', date: '2026-12-01', reminderMessage: message },
    });
    // The manager is a member too and gets the reminder.
    expect((await inbox(m)).notifications.map((n: any) => n.type)).toContain('schedule_reminder');

    await m.put(`/api/schedule/${item.id}`, { startTime: '21:00', timeZone: 'UTC' });
    expect(await sendDueReminders(new Date('2026-12-01T21:00:00Z'))).toBe(1);
  });

  it('drops a reminder found long after its time (server was asleep)', async () => {
    const m = await manager();
    await m.post('/api/schedule', { date: '2026-12-01', title: 'درس', startTime: '20:30', timeZone: 'UTC' });
    const late = new Date(new Date('2026-12-01T20:30:00Z').getTime() + REMINDER_GRACE_MS + 60_000);
    expect(await sendDueReminders(late)).toBe(0);
  });

  it('copying a week carries the time to the new days', async () => {
    const m = await manager();
    await m.post('/api/schedule', { date: '2026-12-05', title: 'درس', startTime: '06:00', timeZone: 'UTC', reminderMessage: 'هيا' });
    const copied = (await m.post('/api/schedule/copy-week', { to: '2026-12-12' })).body.items;
    expect(copied[0]).toMatchObject({ date: '2026-12-12', startTime: '06:00', remindAt: '2026-12-12T06:00:00.000Z', reminderMessage: 'هيا' });
  });
});

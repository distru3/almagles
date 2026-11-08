import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebPushError } from 'web-push';
import { client, createCategory, createUser, loginAs, prisma, resetDb } from './helpers.js';
import { flushPushes, pushTransport } from '../src/lib/push.js';
import { isPushEndpoint } from '../src/routes/push.js';

const realSend = pushTransport.send;
let sent: { endpoint: string; payload: any }[] = [];
let failWith: Record<string, number> = {};

beforeEach(async () => {
  await resetDb();
  sent = [];
  failWith = {};
  pushTransport.send = async (sub, payload) => {
    if (failWith[sub.endpoint]) throw new WebPushError('gone', failWith[sub.endpoint], {}, '', sub.endpoint);
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    return {};
  };
});

afterEach(() => {
  pushTransport.send = realSend;
});

const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const endpointFor = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

async function subscribe(email: string, name: string) {
  const c = await loginAs(email);
  const res = await c.post('/api/push/subscribe', { endpoint: endpointFor(name), keys: KEYS });
  expect(res.status).toBe(201);
  return c;
}

async function seedPost() {
  const cat = await createCategory();
  const author = await createUser({ email: 'w@test.local', role: 'writer', name: 'كاتب', categoryIds: [cat.id] });
  const post = await prisma.post.create({
    data: { title: 'منشور', description: 'نص', postDate: '2026-10-15', categoryId: cat.id, authorId: author.id },
  });
  return { cat, author, post };
}

describe('push endpoints', () => {
  it('only accepts real push services over https', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isPushEndpoint('https://evil-fcm.googleapis.com.attacker.test/x')).toBe(false);
    expect(isPushEndpoint('https://notpush.apple.com.evil/x')).toBe(false);
    expect(isPushEndpoint('nonsense')).toBe(false);
  });

  it('publishes the public key to anyone', async () => {
    const res = await (await client()).get('/api/push/public-key');
    expect(res.body.publicKey).toMatch(/^B/);
  });

  it('subscribing needs a login and a valid push service', async () => {
    expect((await (await client()).post('/api/push/subscribe', { endpoint: endpointFor('x'), keys: KEYS })).status).toBe(401);
    await createUser({ email: 'a@test.local' });
    const a = await loginAs('a@test.local');
    expect((await a.post('/api/push/subscribe', { endpoint: 'https://localhost:4000/api', keys: KEYS })).status).toBe(400);
    expect((await a.post('/api/push/subscribe', { endpoint: endpointFor('x') })).status).toBe(400);
  });

  it('a device moves to whoever subscribes on it last, and unsubscribing only touches your own', async () => {
    const a = await createUser({ email: 'a@test.local' });
    const b = await createUser({ email: 'b@test.local' });
    await subscribe('a@test.local', 'phone');
    const bc = await subscribe('b@test.local', 'phone');
    const rows = await prisma.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(b.id);

    const ac = await loginAs('a@test.local');
    await ac.post('/api/push/unsubscribe', { endpoint: endpointFor('phone') });
    expect(await prisma.pushSubscription.count()).toBe(1); // not A's any more
    await bc.post('/api/push/unsubscribe', { endpoint: endpointFor('phone') });
    expect(await prisma.pushSubscription.count()).toBe(0);
    expect(a.id).not.toBe(b.id);
  });
});

describe('push delivery', () => {
  it('a comment pushes to the post author with the text and a link to the comment', async () => {
    const { post } = await seedPost();
    await subscribe('w@test.local', 'writer-phone');
    await createUser({ email: 'v@test.local', name: 'زائر' });
    const v = await subscribe('v@test.local', 'visitor-phone');
    const comment = (await v.post(`/api/comments/${post.id}`, { content: 'بارك الله فيكم' })).body.comment;
    await flushPushes();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      endpoint: endpointFor('writer-phone'),
      payload: {
        title: 'رجال الأمة',
        body: 'زائر علّق على منشورك «منشور»\nبارك الله فيكم',
        url: `/post/${post.id}?n=${(await prisma.notification.findFirstOrThrow()).id}#comment-${comment.id}`,
        tag: `comment:${comment.id}`,
      },
    });
  });

  it('a new post reaches every subscribed device except the author’s', async () => {
    const cat = await createCategory();
    await createUser({ email: 'w@test.local', role: 'writer', categoryIds: [cat.id] });
    await createUser({ email: 'v1@test.local' });
    await createUser({ email: 'v2@test.local' });
    await createUser({ email: 'v3@test.local' }); // never turned push on
    const w = await subscribe('w@test.local', 'w');
    await subscribe('v1@test.local', 'v1-phone');
    await subscribe('v1@test.local', 'v1-laptop');
    await subscribe('v2@test.local', 'v2');

    await w.agent
      .post('/api/posts')
      .set('X-CSRF-Token', w.csrf)
      .field('title', 'جديد')
      .field('description', 'نص')
      .field('categoryId', cat.id)
      .field('postDate', '2026-10-15');
    await flushPushes();

    expect(sent.map((s) => s.endpoint).sort()).toEqual([endpointFor('v1-laptop'), endpointFor('v1-phone'), endpointFor('v2')]);
    expect(sent[0].payload.body).toBe('منشور جديد: «جديد»');
  });

  it('a reaction on a comment pushes without repeating the comment', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'a@test.local', name: 'ألف' });
    const a = await subscribe('a@test.local', 'a');
    const comment = (await a.post(`/api/comments/${post.id}`, { content: 'تعليق' })).body.comment;
    await flushPushes();
    sent = [];

    await (await loginAs('w@test.local')).put(`/api/comments/${comment.id}/reactions`, { type: 'love' });
    await flushPushes();
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.body).toBe('كاتب تفاعل مع تعليقك في «منشور»');
  });

  it('forgets devices the push service says are gone, keeps the rest', async () => {
    const { post } = await seedPost();
    await subscribe('w@test.local', 'gone');
    await (await loginAs('w@test.local')).post('/api/push/subscribe', { endpoint: endpointFor('flaky'), keys: KEYS });
    await (await loginAs('w@test.local')).post('/api/push/subscribe', { endpoint: endpointFor('fine'), keys: KEYS });
    failWith = { [endpointFor('gone')]: 410, [endpointFor('flaky')]: 500 };

    await createUser({ email: 'v@test.local' });
    await (await loginAs('v@test.local')).post(`/api/comments/${post.id}`, { content: 'مرحبا' });
    await flushPushes();

    expect(sent.map((s) => s.endpoint)).toEqual([endpointFor('fine')]);
    const left = (await prisma.pushSubscription.findMany()).map((s) => s.endpoint).sort();
    expect(left).toEqual([endpointFor('fine'), endpointFor('flaky')]);
  });
});

describe('test notification', () => {
  it('needs a login', async () => {
    expect((await (await client()).post('/api/push/test')).status).toBe(401);
  });

  it('reports each device, with the push service’s own reason when it refuses', async () => {
    await createUser({ email: 'a@test.local' });
    const a = await subscribe('a@test.local', 'android');
    await a.post('/api/push/subscribe', { endpoint: 'https://web.push.apple.com/QGx-iphone', keys: KEYS });
    const realFail = pushTransport.send;
    pushTransport.send = async (sub, payload, options) => {
      if (sub.endpoint.includes('apple')) throw new WebPushError('refused', 403, {}, '{"reason":"BadJwtToken"}', sub.endpoint);
      return realFail(sub, payload, options);
    };

    const res = await a.post('/api/push/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      devices: 2,
      sent: 1,
      failures: [{ service: 'apple', status: 403, reason: '{"reason":"BadJwtToken"}' }],
    });
    expect(sent[0].payload).toMatchObject({ tag: 'test', url: '/notifications' });
    // A refusal other than "gone" keeps the device.
    expect(await prisma.pushSubscription.count()).toBe(2);
  });

  it('says so when the account has no device', async () => {
    await createUser({ email: 'a@test.local' });
    const res = await (await loginAs('a@test.local')).post('/api/push/test');
    expect(res.body).toEqual({ devices: 0, sent: 0, failures: [] });
  });
});

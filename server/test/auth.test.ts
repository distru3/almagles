import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PASSWORD, app, client, createUser, loginAs, prisma, resetDb } from './helpers.js';

beforeEach(resetDb);

const refreshCookie = (res: { headers: Record<string, unknown> }) =>
  ((res.headers['set-cookie'] as string[] | undefined) ?? []).find((c) => c.startsWith('alm_refresh='))?.split(';')[0];

describe('signup', () => {
  it('creates a visitor after the emailed code is confirmed', async () => {
    const c = await client();
    const sent = await c.post('/api/auth/send-code', { email: 'New@Test.local', purpose: 'signup' });
    expect(sent.status).toBe(202);
    expect(sent.body.devCode).toMatch(/^\d{6}$/);

    const res = await c.post('/api/auth/signup', { name: 'جديد', email: 'new@test.local', password: PASSWORD, code: sent.body.devCode });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'new@test.local', role: 'visitor' });
    expect((await c.get('/api/auth/me')).body.user.email).toBe('new@test.local');
  });

  it('rejects a wrong code, and locks the code after five wrong attempts', async () => {
    const c = await client();
    const { devCode } = (await c.post('/api/auth/send-code', { email: 'x@test.local', purpose: 'signup' })).body;
    const wrong = devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect((await c.post('/api/auth/signup', { name: 'اسم', email: 'x@test.local', password: PASSWORD, code: wrong })).status).toBe(400);
    }
    // Even the right code no longer works once the attempts are used up.
    const res = await c.post('/api/auth/signup', { name: 'اسم', email: 'x@test.local', password: PASSWORD, code: devCode });
    expect(res.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it('refuses to send a signup code for an email that is already registered', async () => {
    await createUser({ email: 'taken@test.local' });
    const c = await client();
    expect((await c.post('/api/auth/send-code', { email: 'taken@test.local', purpose: 'signup' })).status).toBe(409);
  });
});

describe('login and sessions', () => {
  it('logs in with the right password and rejects a wrong one with a generic message', async () => {
    await createUser({ email: 'a@test.local' });
    const c = await client();
    const bad = await c.post('/api/auth/login', { email: 'a@test.local', password: 'nope-nope' });
    const unknown = await c.post('/api/auth/login', { email: 'nobody@test.local', password: 'nope-nope' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.message).toBe(unknown.body.message); // no account enumeration
    expect((await c.post('/api/auth/login', { email: 'a@test.local', password: PASSWORD })).status).toBe(200);
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    await createUser({ email: 'a@test.local' });
    const c = await client();
    const res = await c.agent.post('/api/auth/login').send({ email: 'a@test.local', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('rotates the refresh token, and two tabs refreshing at once both succeed', async () => {
    await createUser({ email: 'a@test.local' });
    const c = await loginAs('a@test.local');
    const original = await prisma.refreshToken.findFirstOrThrow();

    const [r1, r2] = await Promise.all([c.post('/api/auth/refresh'), c.post('/api/auth/refresh')]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const rotated = await prisma.refreshToken.findUniqueOrThrow({ where: { id: original.id } });
    expect(rotated.rotatedAt).not.toBeNull();
  });

  it('rejects a rotated token once the grace window has passed', async () => {
    await createUser({ email: 'a@test.local' });
    const c = await client();
    const original = refreshCookie(await c.post('/api/auth/login', { email: 'a@test.local', password: PASSWORD }));
    expect(original).toBeDefined();
    expect((await c.post('/api/auth/refresh')).status).toBe(200); // rotates `original`

    // Pretend the rotation happened a minute ago, past the 30-second grace window.
    await prisma.refreshToken.updateMany({ where: { rotatedAt: { not: null } }, data: { rotatedAt: new Date(Date.now() - 60_000) } });

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`alm_csrf=${c.csrf}`, original!])
      .set('X-CSRF-Token', c.csrf);
    expect(replay.status).toBe(401);
    // The current (rotated-to) session is unaffected.
    expect((await c.post('/api/auth/refresh')).status).toBe(200);
  });

  it('logout revokes the session even when the access token has expired', async () => {
    await createUser({ email: 'a@test.local' });
    const c = await loginAs('a@test.local');
    expect(await prisma.refreshToken.count()).toBe(1);
    expect((await c.post('/api/auth/logout')).status).toBe(200);
    expect(await prisma.refreshToken.count()).toBe(0);
    expect((await c.post('/api/auth/refresh')).status).toBe(401);
  });

  it('keeps at most ten active sessions per user', async () => {
    await createUser({ email: 'a@test.local' });
    for (let i = 0; i < 12; i++) await loginAs('a@test.local');
    expect(await prisma.refreshToken.count({ where: { rotatedAt: null } })).toBe(10);
  });
});

describe('password reset', () => {
  it('sets the new password and signs out every device', async () => {
    await createUser({ email: 'a@test.local' });
    await loginAs('a@test.local');
    await loginAs('a@test.local');
    const c = await client();
    const { devCode } = (await c.post('/api/auth/send-code', { email: 'a@test.local', purpose: 'reset' })).body;
    expect((await c.post('/api/auth/reset-password', { email: 'a@test.local', code: devCode, password: 'brand-new-pass' })).status).toBe(200);

    expect(await prisma.refreshToken.count()).toBe(0);
    expect((await c.post('/api/auth/login', { email: 'a@test.local', password: PASSWORD })).status).toBe(401);
    expect((await c.post('/api/auth/login', { email: 'a@test.local', password: 'brand-new-pass' })).status).toBe(200);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, client, createCategory, createUser, loginAs, PASSWORD, prisma, resetDb } from './helpers.js';

beforeEach(resetDb);

describe('own profile', () => {
  it('updates name and bio, and /auth/me reflects them', async () => {
    await createUser({ email: 'a@test.local', name: 'قديم' });
    const c = await loginAs('a@test.local');
    const res = await c.patch('/api/profile', { name: '  اسم جديد ', bio: 'طالب علم\nمن الشام' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'اسم جديد', bio: 'طالب علم\nمن الشام', avatarUrl: null });
    expect((await c.get('/api/auth/me')).body.user).toMatchObject({ name: 'اسم جديد', bio: 'طالب علم\nمن الشام' });
    // An empty bio clears it
    expect((await c.patch('/api/profile', { bio: '   ' })).body.user.bio).toBeNull();
  });

  it('validates the name and bio length', async () => {
    await createUser({ email: 'a@test.local' });
    const c = await loginAs('a@test.local');
    expect((await c.patch('/api/profile', { name: 'ا' })).status).toBe(400);
    expect((await c.patch('/api/profile', { bio: 'x'.repeat(301) })).status).toBe(400);
  });

  it('needs a login and the CSRF header', async () => {
    expect((await (await client()).patch('/api/profile', { name: 'محاولة' })).status).toBe(401);
    await createUser({ email: 'a@test.local' });
    const c = await loginAs('a@test.local');
    expect((await c.agent.patch('/api/profile').send({ name: 'بلا رمز' })).status).toBe(403);
  });

  it('can only change its own record: no way to set role or email', async () => {
    const u = await createUser({ email: 'a@test.local' });
    const c = await loginAs('a@test.local');
    await c.patch('/api/profile', { name: 'اسم', role: 'admin', email: 'x@evil.test' });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.role).toBe('visitor');
    expect(after.email).toBe('a@test.local');
  });
});

describe('profile photo', () => {
  it('rejects anonymous uploads and non-images', async () => {
    const anon = await client();
    expect((await anon.agent.post('/api/profile/avatar').set('X-CSRF-Token', anon.csrf).attach('avatar', Buffer.from('x'), 'a.png')).status).toBe(401);
    await createUser({ email: 'a@test.local' });
    const c = await loginAs('a@test.local');
    const res = await c.agent
      .post('/api/profile/avatar')
      .set('X-CSRF-Token', c.csrf)
      .attach('avatar', Buffer.from('%PDF-1.4'), { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('removing a photo when there is none is harmless', async () => {
    await createUser({ email: 'a@test.local' });
    const c = await loginAs('a@test.local');
    const res = await c.del('/api/profile/avatar');
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toBeNull();
  });
});

describe('password change', () => {
  it('needs the current password, then signs out other devices but keeps this one', async () => {
    await createUser({ email: 'a@test.local' });
    const phone = await loginAs('a@test.local');
    const laptop = await loginAs('a@test.local');

    expect((await phone.post('/api/profile/password', { currentPassword: 'wrong-password', newPassword: 'new-password-1' })).status).toBe(400);
    expect((await phone.post('/api/profile/password', { currentPassword: PASSWORD, newPassword: 'short' })).status).toBe(400);

    const ok = await phone.post('/api/profile/password', { currentPassword: PASSWORD, newPassword: 'new-password-1' });
    expect(ok.status).toBe(200);
    expect((await phone.get('/api/auth/me')).status).toBe(200);
    expect((await laptop.post('/api/auth/refresh')).status).toBe(401);

    const fresh = await client();
    expect((await fresh.post('/api/auth/login', { email: 'a@test.local', password: PASSWORD })).status).toBe(401);
    expect((await fresh.post('/api/auth/login', { email: 'a@test.local', password: 'new-password-1' })).status).toBe(200);
  });
});

describe('public profile', () => {
  it('shows name, bio, photo and counts to anyone, never the email', async () => {
    const cat = await createCategory();
    const w = await createUser({ email: 'w@test.local', role: 'writer', name: 'كاتب', categoryIds: [cat.id] });
    await prisma.user.update({ where: { id: w.id }, data: { bio: 'نبذة', avatarUrl: 'https://res.cloudinary.com/x/image/upload/a.webp' } });
    await prisma.post.create({ data: { title: 'أ', description: 'ن', postDate: '2026-10-15', categoryId: cat.id, authorId: w.id } });
    const other = await createUser({ email: 'o@test.local' });
    await prisma.post.create({ data: { title: 'ب', description: 'ن', postDate: '2026-10-15', categoryId: cat.id, authorId: (await createUser({ role: 'admin' })).id } });

    const res = await request(app).get(`/api/profile/${w.id}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ name: 'كاتب', role: 'writer', bio: 'نبذة', postsCount: 1, commentsCount: 0 });
    expect(JSON.stringify(res.body)).not.toContain('w@test.local');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect((await request(app).get('/api/profile/nope')).status).toBe(404);
    expect(other).toBeTruthy();

    // Their posts, and only theirs, through the list filter; with the author's photo.
    const list = await request(app).get(`/api/posts?author=${w.id}`);
    expect(list.body.items.map((p: { title: string }) => p.title)).toEqual(['أ']);
    expect(list.body.items[0].author.avatarUrl).toContain('cloudinary');
  });
});

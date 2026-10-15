import { beforeEach, describe, expect, it } from 'vitest';
import { client, createCategory, createUser, loginAs, prisma, resetDb } from './helpers.js';

beforeEach(resetDb);

/** Posts are created as multipart forms (they can carry an image). */
function postForm(c: Awaited<ReturnType<typeof client>>, categoryId: string, title = 'عنوان') {
  return c.agent
    .post('/api/posts')
    .set('X-CSRF-Token', c.csrf)
    .field('title', title)
    .field('description', 'نص المنشور')
    .field('categoryId', categoryId)
    .field('postDate', '2026-10-15');
}

describe('publishing posts', () => {
  it('anonymous visitors and visitor accounts cannot post', async () => {
    const cat = await createCategory();
    await createUser({ email: 'v@test.local' });
    expect((await postForm(await client(), cat.id)).status).toBe(401);
    expect((await postForm(await loginAs('v@test.local'), cat.id)).status).toBe(403);
    expect(await prisma.post.count()).toBe(0);
  });

  it('turns visitors away before their upload is read', async () => {
    // A file the upload filter would reject: if the permission check ran after
    // the upload parser, this would come back 400 (bad file) instead of 403.
    const cat = await createCategory();
    await createUser({ email: 'v@test.local' });
    const v = await loginAs('v@test.local');
    const res = await v.agent
      .post('/api/posts')
      .set('X-CSRF-Token', v.csrf)
      .field('title', 'عنوان')
      .field('description', 'نص')
      .field('categoryId', cat.id)
      .field('postDate', '2026-10-15')
      .attach('image', Buffer.from('not an image'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(403);
  });

  it('a writer posts only in their own categories', async () => {
    const mine = await createCategory();
    const other = await createCategory();
    await createUser({ email: 'w@test.local', role: 'writer', categoryIds: [mine.id] });
    const w = await loginAs('w@test.local');
    expect((await postForm(w, mine.id)).status).toBe(201);
    expect((await postForm(w, other.id)).status).toBe(403);
  });

  it('a writer cannot edit or delete posts in a category they do not manage', async () => {
    const mine = await createCategory();
    const other = await createCategory();
    await createUser({ email: 'w@test.local', role: 'writer', categoryIds: [mine.id] });
    await createUser({ email: 'admin@test.local', role: 'admin' });
    const adminPost = (await postForm(await loginAs('admin@test.local'), other.id)).body.post;

    const w = await loginAs('w@test.local');
    expect((await w.del(`/api/posts/${adminPost.id}`)).status).toBe(403);
    expect(await prisma.post.count()).toBe(1);
  });

  it('an admin can post in any category', async () => {
    const cat = await createCategory();
    await createUser({ email: 'admin@test.local', role: 'admin' });
    expect((await postForm(await loginAs('admin@test.local'), cat.id)).status).toBe(201);
  });
});

describe('schedule editing', () => {
  const session = { date: '2026-10-17', title: 'تدبر سورة الأنعام' };

  it('needs the schedule permission (or admin)', async () => {
    const cat = await createCategory();
    await createUser({ email: 'v@test.local' });
    await createUser({ email: 'w@test.local', role: 'writer', categoryIds: [cat.id] });
    await createUser({ email: 'ws@test.local', role: 'writer', categoryIds: [cat.id], canManageSchedule: true });
    await createUser({ email: 'admin@test.local', role: 'admin' });

    expect((await (await client()).post('/api/schedule', session)).status).toBe(401);
    expect((await (await loginAs('v@test.local')).post('/api/schedule', session)).status).toBe(403);
    expect((await (await loginAs('w@test.local')).post('/api/schedule', session)).status).toBe(403);
    expect((await (await loginAs('ws@test.local')).post('/api/schedule', session)).status).toBe(201);
    expect((await (await loginAs('admin@test.local')).post('/api/schedule', session)).status).toBe(201);
  });

  it('anyone can read the schedule', async () => {
    await prisma.scheduleItem.create({ data: { date: '2026-10-17', weekdayKey: 'sat', timeLabel: 'فجر', title: 'درس' } });
    const res = await (await client()).get('/api/schedule');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});

describe('«ملاحظات المجلس»', () => {
  it('any writer or admin can write; visitors and anonymous users cannot; everyone can read', async () => {
    const cat = await createCategory();
    await createUser({ email: 'v@test.local' });
    await createUser({ email: 'w@test.local', role: 'writer', categoryIds: [cat.id] }); // no schedule permission
    await createUser({ email: 'admin@test.local', role: 'admin' });

    expect((await (await client()).put('/api/schedule/notes/2026-10-17', { content: 'x' })).status).toBe(401);
    expect((await (await loginAs('v@test.local')).put('/api/schedule/notes/2026-10-17', { content: 'x' })).status).toBe(403);
    expect((await (await loginAs('w@test.local')).put('/api/schedule/notes/2026-10-17', { content: 'من الكاتب' })).status).toBe(200);
    expect((await (await loginAs('admin@test.local')).put('/api/schedule/notes/2026-10-18', { content: 'من المشرف' })).status).toBe(200);

    const pub = await (await client()).get('/api/schedule?from=2026-10-17&to=2026-10-18');
    expect(pub.body.notes.map((n: { content: string }) => n.content)).toEqual(['من الكاتب', 'من المشرف']);
  });
});

describe('admin-only actions and safeguards', () => {
  it('only admins can manage users and categories', async () => {
    const cat = await createCategory();
    await createUser({ email: 'w@test.local', role: 'writer', categoryIds: [cat.id] });
    const w = await loginAs('w@test.local');
    expect((await w.get('/api/users')).status).toBe(403);
    expect((await w.post('/api/categories', { name: 'قسم جديد' })).status).toBe(403);
    expect((await w.get('/api/comments')).status).toBe(403);
  });

  it('the last admin cannot be demoted', async () => {
    const admin = await createUser({ email: 'admin@test.local', role: 'admin' });
    const a = await loginAs('admin@test.local');
    const res = await a.put(`/api/users/${admin.id}`, { role: 'visitor' });
    expect(res.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe('admin');

    // With a second admin, demotion is allowed.
    await createUser({ email: 'admin2@test.local', role: 'admin' });
    expect((await a.put(`/api/users/${admin.id}`, { role: 'visitor' })).status).toBe(200);
  });

  it('a category that still has posts cannot be deleted', async () => {
    const cat = await createCategory();
    await createUser({ email: 'admin@test.local', role: 'admin' });
    const a = await loginAs('admin@test.local');
    await postForm(a, cat.id);
    expect((await a.del(`/api/categories/${cat.id}`)).status).toBe(409);
    expect(await prisma.category.count()).toBe(1);
  });
});

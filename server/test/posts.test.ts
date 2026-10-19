import { beforeEach, describe, expect, it } from 'vitest';
import { client, createCategory, createUser, loginAs, prisma, resetDb } from './helpers.js';

beforeEach(resetDb);

async function seedPost() {
  const cat = await createCategory();
  const author = await createUser({ email: 'w@test.local', role: 'writer', name: 'كاتب', categoryIds: [cat.id] });
  const post = await prisma.post.create({
    data: { title: 'منشور', description: 'نص', postDate: '2026-10-15', categoryId: cat.id, authorId: author.id },
  });
  return { cat, author, post };
}

describe('reactions', () => {
  it('toggles, switches and removes a single reaction per user', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'v@test.local' });
    const v = await loginAs('v@test.local');
    const url = `/api/posts/${post.id}/reactions`;

    expect((await v.put(url, { type: 'love' })).body).toMatchObject({ removed: false, type: 'love' });
    expect((await v.put(url, { type: 'like' })).body).toMatchObject({ removed: false, type: 'like' }); // switch, not add
    expect(await prisma.reaction.count()).toBe(1);
    expect((await v.put(url, { type: 'like' })).body).toMatchObject({ removed: true }); // same type again removes
    expect(await prisma.reaction.count()).toBe(0);
  });

  it('survives a double-click: two identical requests at once leave one reaction', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'v@test.local' });
    const v = await loginAs('v@test.local');
    const url = `/api/posts/${post.id}/reactions`;
    const results = await Promise.all([v.put(url, { type: 'love' }), v.put(url, { type: 'love' })]);
    expect(results.every((r) => r.status < 500)).toBe(true);
    expect(await prisma.reaction.count()).toBeLessThanOrEqual(1);
  });

  it('requires login', async () => {
    const { post } = await seedPost();
    expect((await (await client()).put(`/api/posts/${post.id}/reactions`, { type: 'love' })).status).toBe(401);
  });
});

describe('feed list', () => {
  it("returns the author's role, the viewer's reaction and the newest top-level comment", async () => {
    const { post } = await seedPost();
    const v = await createUser({ email: 'v@test.local', name: 'زائر' });
    const older = await prisma.comment.create({ data: { postId: post.id, authorId: v.id, content: 'الأقدم' } });
    await prisma.comment.create({ data: { postId: post.id, authorId: v.id, content: 'الأحدث', createdAt: new Date(Date.now() + 1000) } });
    await prisma.comment.create({ data: { postId: post.id, authorId: v.id, parentId: older.id, content: 'رد', createdAt: new Date(Date.now() + 2000) } });
    await prisma.reaction.create({ data: { postId: post.id, userId: v.id, type: 'insight' } });

    const res = await (await loginAs('v@test.local')).get('/api/posts');
    const item = res.body.items[0];
    expect(item.author).toMatchObject({ name: 'كاتب', role: 'writer' });
    expect(item.myReaction).toBe('insight');
    expect(item.commentsCount).toBe(3);
    expect(item.topComment).toEqual({ content: 'الأحدث', authorName: 'زائر' }); // replies never preview
  });
});

describe('admin comments list', () => {
  it('pages through every comment and filters by type and search', async () => {
    const { post } = await seedPost();
    const v = await createUser({ email: 'v@test.local', name: 'سارة' });
    const top = await prisma.comment.create({ data: { postId: post.id, authorId: v.id, content: 'رئيسي 0' } });
    for (let i = 1; i < 60; i++) await prisma.comment.create({ data: { postId: post.id, authorId: v.id, content: `رئيسي ${i}` } });
    for (let i = 0; i < 5; i++) await prisma.comment.create({ data: { postId: post.id, authorId: v.id, parentId: top.id, content: `رد ${i}` } });

    await createUser({ email: 'admin@test.local', role: 'admin' });
    const a = await loginAs('admin@test.local');
    const page1 = await a.get('/api/comments?limit=50');
    const page2 = await a.get('/api/comments?limit=50&page=2');
    expect(page1.body.total).toBe(65);
    expect(page1.body.comments).toHaveLength(50);
    expect(page2.body.comments).toHaveLength(15);
    expect((await a.get('/api/comments?type=reply')).body.total).toBe(5);
    expect((await a.get(`/api/comments?q=${encodeURIComponent('سارة')}`)).body.total).toBe(65);
    expect((await a.get('/api/comments?limit=500')).status).toBe(400);
  });
});

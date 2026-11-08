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

const inbox = async (email: string) => (await (await loginAs(email)).get('/api/notifications')).body;

describe('notifications are created', () => {
  it('a comment notifies the post author, not the commenter', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'v@test.local', name: 'زائر' });
    const v = await loginAs('v@test.local');
    await v.post(`/api/comments/${post.id}`, { content: 'جزاكم الله خيراً' });

    const body = await inbox('w@test.local');
    expect(body.unreadCount).toBe(1);
    expect(body.notifications[0]).toMatchObject({
      type: 'comment',
      read: false,
      actor: { name: 'زائر' },
      post: { id: post.id, title: 'منشور' },
      excerpt: 'جزاكم الله خيراً',
    });
    expect((await inbox('v@test.local')).unreadCount).toBe(0);
  });

  it('a reply notifies the person replied to and the top-level commenter, once each', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'a@test.local' });
    await createUser({ email: 'b@test.local' });
    await createUser({ email: 'c@test.local' });
    const a = await loginAs('a@test.local');
    const b = await loginAs('b@test.local');
    const c = await loginAs('c@test.local');

    const top = (await a.post(`/api/comments/${post.id}`, { content: 'أول' })).body.comment;
    const reply = (await b.post(`/api/comments/${post.id}`, { content: 'رد', parentId: top.id })).body.comment;
    // C answers B's reply; it is stored under A's comment, but B must hear about it too.
    await c.post(`/api/comments/${post.id}`, { content: 'رد على الرد', parentId: reply.id });

    const forA = await inbox('a@test.local');
    expect(forA.notifications.map((n: any) => n.type)).toEqual(['reply', 'reply']);
    const forB = await inbox('b@test.local');
    expect(forB.notifications).toHaveLength(1);
    expect(forB.notifications[0]).toMatchObject({ type: 'reply', excerpt: 'رد على الرد' });
    // The post author hears about every comment, as "comment".
    const forW = await inbox('w@test.local');
    expect(forW.notifications.map((n: any) => n.type)).toEqual(['comment', 'comment', 'comment']);
  });

  it('replying to yourself on your own post notifies nobody', async () => {
    const { post } = await seedPost();
    const w = await loginAs('w@test.local');
    const top = (await w.post(`/api/comments/${post.id}`, { content: 'تنبيه' })).body.comment;
    await w.post(`/api/comments/${post.id}`, { content: 'تكملة', parentId: top.id });
    expect(await prisma.notification.count()).toBe(0);
  });

  it('a reaction notifies once, survives a switch, and disappears when removed', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'v@test.local' });
    const v = await loginAs('v@test.local');
    const url = `/api/posts/${post.id}/reactions`;

    await v.put(url, { type: 'love' });
    await v.put(url, { type: 'like' });
    expect(await prisma.notification.count({ where: { type: 'reaction' } })).toBe(1);
    await v.put(url, { type: 'like' }); // same again: removed
    expect(await prisma.notification.count({ where: { type: 'reaction' } })).toBe(0);
  });

  it('a new post notifies every other account', async () => {
    const cat = await createCategory();
    await createUser({ email: 'w@test.local', role: 'writer', categoryIds: [cat.id] });
    await createUser({ email: 'v1@test.local' });
    await createUser({ email: 'v2@test.local' });
    const w = await loginAs('w@test.local');
    const res = await w.agent
      .post('/api/posts')
      .set('X-CSRF-Token', w.csrf)
      .field('title', 'جديد')
      .field('description', 'نص')
      .field('categoryId', cat.id)
      .field('postDate', '2026-10-15');
    expect(res.status).toBe(201);

    expect((await inbox('v1@test.local')).notifications[0]).toMatchObject({ type: 'new_post', post: { title: 'جديد' } });
    expect((await inbox('v2@test.local')).unreadCount).toBe(1);
    expect((await inbox('w@test.local')).unreadCount).toBe(0);
  });

  it('deleting the comment or post removes its notifications', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'v@test.local' });
    const v = await loginAs('v@test.local');
    const comment = (await v.post(`/api/comments/${post.id}`, { content: 'سيحذف' })).body.comment;
    expect(await prisma.notification.count()).toBe(1);
    await v.del(`/api/comments/${comment.id}`);
    expect(await prisma.notification.count()).toBe(0);

    await v.put(`/api/posts/${post.id}/reactions`, { type: 'love' });
    await prisma.post.delete({ where: { id: post.id } });
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe('notifications API', () => {
  it('needs a login', async () => {
    const anon = await client();
    expect((await anon.get('/api/notifications')).status).toBe(401);
    expect((await anon.get('/api/notifications/unread-count')).status).toBe(401);
    expect((await anon.post('/api/notifications/read', {})).status).toBe(401);
  });

  it('marks some or all as read, and only your own', async () => {
    const { post } = await seedPost();
    const v = await createUser({ email: 'v@test.local' });
    const other = await createUser({ email: 'o@test.local' });
    const make = (userId: string) => prisma.notification.create({ data: { type: 'comment', userId, postId: post.id, actorId: v.id } });
    const [n1] = await Promise.all([make(other.id), make(other.id), make(other.id)]);
    const mine = await make(v.id);

    const vc = await loginAs('v@test.local');
    // Someone else's id is silently ignored.
    expect((await vc.post('/api/notifications/read', { ids: [n1.id] })).body.unreadCount).toBe(1);
    expect(await prisma.notification.count({ where: { userId: other.id, readAt: null } })).toBe(3);

    const oc = await loginAs('o@test.local');
    expect((await oc.post('/api/notifications/read', { ids: [n1.id] })).body.unreadCount).toBe(2);
    expect((await oc.post('/api/notifications/read', {})).body.unreadCount).toBe(0);
    expect((await oc.get('/api/notifications/unread-count')).body.count).toBe(0);

    expect((await vc.post('/api/notifications/read', { ids: [mine.id] })).body.unreadCount).toBe(0);
  });

  it('pages newest first with a cursor', async () => {
    const { post } = await seedPost();
    const v = await createUser({ email: 'v@test.local' });
    for (let i = 0; i < 5; i++) {
      await prisma.notification.create({
        data: { type: 'new_post', userId: v.id, postId: post.id, createdAt: new Date(Date.UTC(2026, 0, 1 + i)) },
      });
    }
    const vc = await loginAs('v@test.local');
    const first = (await vc.get('/api/notifications?limit=2')).body;
    expect(first.notifications.map((n: any) => n.createdAt)).toEqual(['2026-01-05T00:00:00.000Z', '2026-01-04T00:00:00.000Z']);
    const second = (await vc.get(`/api/notifications?limit=2&cursor=${first.nextCursor}`)).body;
    expect(second.notifications.map((n: any) => n.createdAt)).toEqual(['2026-01-03T00:00:00.000Z', '2026-01-02T00:00:00.000Z']);
    const last = (await vc.get(`/api/notifications?limit=2&cursor=${second.nextCursor}`)).body;
    expect(last.notifications).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
  });
});

describe('reactions on comments and replies', () => {
  it('toggles, switches, and shows counts and your own reaction in the comment list', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'a@test.local' });
    await createUser({ email: 'b@test.local' });
    const a = await loginAs('a@test.local');
    const b = await loginAs('b@test.local');
    const comment = (await a.post(`/api/comments/${post.id}`, { content: 'تعليق' })).body.comment;
    const url = `/api/comments/${comment.id}/reactions`;

    expect((await b.put(url, { type: 'love' })).body).toMatchObject({ removed: false, type: 'love' });
    expect((await b.put(url, { type: 'like' })).body).toMatchObject({ removed: false, type: 'like' });
    await a.put(url, { type: 'like' });

    const forB = (await b.get(`/api/comments/post/${post.id}`)).body.comments[0];
    expect(forB).toMatchObject({ reactionCounts: { like: 2 }, myReaction: 'like' });
    const anon = (await (await client()).get(`/api/comments/post/${post.id}`)).body.comments[0];
    expect(anon).toMatchObject({ reactionCounts: { like: 2 }, myReaction: null });

    expect((await b.put(url, { type: 'like' })).body).toMatchObject({ removed: true });
    expect(await prisma.commentReaction.count()).toBe(1);
  });

  it('notifies the comment or reply author once, and not for their own reaction', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'a@test.local' });
    await createUser({ email: 'b@test.local', name: 'باء' });
    const a = await loginAs('a@test.local');
    const b = await loginAs('b@test.local');
    const top = (await a.post(`/api/comments/${post.id}`, { content: 'أصل' })).body.comment;
    const reply = (await a.post(`/api/comments/${post.id}`, { content: 'فرع', parentId: top.id })).body.comment;
    await prisma.notification.deleteMany();

    await b.put(`/api/comments/${top.id}/reactions`, { type: 'love' });
    await b.put(`/api/comments/${top.id}/reactions`, { type: 'insight' }); // switch: no second one
    await b.put(`/api/comments/${reply.id}/reactions`, { type: 'like' });
    await a.put(`/api/comments/${reply.id}/reactions`, { type: 'like' }); // own reply: nothing

    const forA = await inbox('a@test.local');
    expect(forA.notifications).toHaveLength(2);
    expect(forA.notifications[0]).toMatchObject({ type: 'comment_reaction', actor: { name: 'باء' }, commentId: reply.id, excerpt: 'فرع' });
    expect(forA.notifications[1]).toMatchObject({ type: 'comment_reaction', commentId: top.id });

    await b.put(`/api/comments/${reply.id}/reactions`, { type: 'like' }); // removed
    expect((await inbox('a@test.local')).notifications).toHaveLength(1);
  });

  it('validates the type, needs a login, and 404s for a missing comment', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'a@test.local' });
    const a = await loginAs('a@test.local');
    const comment = (await a.post(`/api/comments/${post.id}`, { content: 'تعليق' })).body.comment;
    expect((await a.put(`/api/comments/${comment.id}/reactions`, { type: '🔥' })).status).toBe(400);
    expect((await a.put('/api/comments/nope/reactions', { type: 'like' })).status).toBe(404);
    expect((await (await client()).put(`/api/comments/${comment.id}/reactions`, { type: 'like' })).status).toBe(401);
  });

  it('deleting a comment removes its reactions', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'a@test.local' });
    const a = await loginAs('a@test.local');
    const comment = (await a.post(`/api/comments/${post.id}`, { content: 'تعليق' })).body.comment;
    await (await loginAs('w@test.local')).put(`/api/comments/${comment.id}/reactions`, { type: 'like' });
    await a.del(`/api/comments/${comment.id}`);
    expect(await prisma.commentReaction.count()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });
});

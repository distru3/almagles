import { beforeEach, describe, expect, it } from 'vitest';
import { client, createCategory, createUser, loginAs, prisma, resetDb } from './helpers.js';

beforeEach(resetDb);

async function seedPost() {
  const cat = await createCategory();
  const author = await createUser({ email: 'w@test.local', role: 'writer', name: 'كاتب', categoryIds: [cat.id] });
  const post = await prisma.post.create({
    data: { title: 'منشور', description: 'نص', postDate: '2026-10-15', categoryId: cat.id, authorId: author.id },
  });
  return { author, post };
}

describe('who reacted to a post', () => {
  it('lists reactors newest first with counts per type, and filters by type', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'a@test.local', name: 'أحمد' });
    await createUser({ email: 'b@test.local', name: 'بلال' });
    await (await loginAs('a@test.local')).put(`/api/posts/${post.id}/reactions`, { type: 'like' });
    await (await loginAs('b@test.local')).put(`/api/posts/${post.id}/reactions`, { type: 'love' });

    const anon = await client();
    const all = await anon.get(`/api/posts/${post.id}/reactions/users`);
    expect(all.status).toBe(200);
    expect(all.body.counts).toEqual({ like: 1, love: 1, insight: 0 });
    expect(all.body.users.map((u: { name: string }) => u.name)).toEqual(['بلال', 'أحمد']);
    expect(all.body.users[0]).toMatchObject({ type: 'love' });
    expect(all.body.users[0]).not.toHaveProperty('email');
    expect(all.body.nextCursor).toBeNull();

    const likes = await anon.get(`/api/posts/${post.id}/reactions/users?type=like`);
    expect(likes.body.users).toHaveLength(1);
    expect(likes.body.users[0]).toMatchObject({ name: 'أحمد', type: 'like' });
  });

  it('counts and filters old emoji rows under the current type', async () => {
    const { post } = await seedPost();
    const u = await createUser({ name: 'قديم' });
    await prisma.reaction.create({ data: { postId: post.id, userId: u.id, type: '❤️' } });

    const res = await (await client()).get(`/api/posts/${post.id}/reactions/users?type=love`);
    expect(res.body.counts.love).toBe(1);
    expect(res.body.users[0]).toMatchObject({ name: 'قديم', type: 'love' });
  });

  it('pages with a cursor without skipping or repeating anyone', async () => {
    const { post } = await seedPost();
    for (let i = 0; i < 5; i++) {
      const u = await createUser();
      await prisma.reaction.create({ data: { postId: post.id, userId: u.id, type: 'like' } });
    }
    const anon = await client();
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/api/posts/${post.id}/reactions/users?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await anon.get(url);
      seen.push(...res.body.users.map((x: { id: string }) => x.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('404s for a missing post and 400s for an unknown type', async () => {
    const { post } = await seedPost();
    const anon = await client();
    expect((await anon.get('/api/posts/nope/reactions/users')).status).toBe(404);
    expect((await anon.get(`/api/posts/${post.id}/reactions/users?type=angry`)).status).toBe(400);
  });
});

describe('who reacted to a comment', () => {
  it('lists the people who reacted to a comment', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'a@test.local', name: 'أحمد' });
    const a = await loginAs('a@test.local');
    const w = await loginAs('w@test.local');
    const comment = (await a.post(`/api/comments/${post.id}`, { content: 'تعليق' })).body.comment;
    await w.put(`/api/comments/${comment.id}/reactions`, { type: 'insight' });

    const res = await (await client()).get(`/api/comments/${comment.id}/reactions/users`);
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ like: 0, love: 0, insight: 1 });
    expect(res.body.users).toEqual([expect.objectContaining({ name: 'كاتب', type: 'insight' })]);

    expect((await (await client()).get('/api/comments/nope/reactions/users')).status).toBe(404);
  });
});

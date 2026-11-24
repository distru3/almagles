import { beforeEach, describe, expect, it } from 'vitest';
import { client, createCategory, createUser, loginAs, prisma, resetDb } from './helpers.js';
import { MAX_MENTIONS, hasMention } from '../src/lib/mentions.js';

beforeEach(resetDb);

async function seedPost() {
  const cat = await createCategory();
  const author = await createUser({ email: 'w@test.local', role: 'writer', name: 'كاتب', categoryIds: [cat.id] });
  const post = await prisma.post.create({
    data: { title: 'منشور', description: 'نص', postDate: '2026-10-15', categoryId: cat.id, authorId: author.id },
  });
  return { author, post };
}

const mentionsOf = (userId: string) => prisma.notification.findMany({ where: { userId, type: 'mention' } });

describe('«@الاسم»: finding the tag in the text', () => {
  it('matches the whole name, spaces and all, and not the start of a longer one', () => {
    expect(hasMention('جزاك الله خيرًا @محمد أحمد', 'محمد أحمد')).toBe(true);
    expect(hasMention('@محمد أحمد، ما رأيك؟', 'محمد أحمد')).toBe(true);
    expect(hasMention('@محمد أحمدي', 'محمد أحمد')).toBe(false);
    expect(hasMention('محمد أحمد', 'محمد أحمد')).toBe(false);
    expect(hasMention('بريد x@محمد', 'محمد')).toBe(false);
    expect(hasMention('(@خالد)', 'خالد')).toBe(true);
    expect(hasMention('سلّم على @أحمد و@خالد', 'خالد')).toBe(true);
  });
});

describe('tagging in comments', () => {
  it('tells the member tagged, once, and links the name back to them', async () => {
    const { post } = await seedPost();
    const a = await createUser({ email: 'a@test.local', name: 'أحمد' });
    const m = await createUser({ email: 'm@test.local', name: 'محمد علي' });
    const c = await loginAs('a@test.local');

    const res = await c.post(`/api/comments/${post.id}`, { content: 'أحسنت @محمد علي — و@محمد علي مرة أخرى', mentions: [m.id, m.id] });
    expect(res.status).toBe(201);
    expect(res.body.comment.mentions).toEqual([{ id: m.id, name: 'محمد علي' }]);

    const told = await mentionsOf(m.id);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ actorId: a.id, postId: post.id, commentId: res.body.comment.id });
    const inbox = (await (await loginAs('m@test.local')).get('/api/notifications')).body.notifications[0];
    expect(inbox).toMatchObject({ type: 'mention', post: { id: post.id }, commentId: res.body.comment.id, excerpt: expect.stringContaining('أحسنت') });

    const list = (await (await client()).get(`/api/comments/post/${post.id}`)).body.comments;
    expect(list[0].mentions).toEqual([{ id: m.id, name: 'محمد علي' }]);
  });

  it('ignores a tag whose name isn’t in the text, a tag of oneself, and an id that is no one', async () => {
    const { post } = await seedPost();
    const a = await createUser({ email: 'a@test.local', name: 'أحمد' });
    const m = await createUser({ email: 'm@test.local', name: 'محمد' });
    const c = await loginAs('a@test.local');
    const res = await c.post(`/api/comments/${post.id}`, { content: 'كلام عام @أحمد', mentions: [m.id, a.id, 'nobody'] });
    expect(res.body.comment.mentions).toEqual([]);
    expect(await prisma.notification.count({ where: { type: 'mention' } })).toBe(0);
  });

  it('doesn’t also tell of a tag someone already hears of as a reply or comment', async () => {
    const { author, post } = await seedPost();
    await createUser({ email: 'a@test.local', name: 'أحمد' });
    const b = await createUser({ email: 'b@test.local', name: 'بلال' });
    const bc = await loginAs('b@test.local');
    const first = (await bc.post(`/api/comments/${post.id}`, { content: 'سؤال' })).body.comment;

    const a = await loginAs('a@test.local');
    await a.post(`/api/comments/${post.id}`, { content: '@بلال @كاتب الجواب…', parentId: first.id, mentions: [b.id, author.id] });
    const forB = await prisma.notification.findMany({ where: { userId: b.id, actor: { email: 'a@test.local' } } });
    expect(forB.map((n) => n.type)).toEqual(['reply']);
    const forAuthor = await prisma.notification.findMany({ where: { userId: author.id, actor: { email: 'a@test.local' } } });
    expect(forAuthor.map((n) => n.type)).toEqual(['comment']);
  });

  it('on editing, keeps the tags still written, drops the deleted, and tells only the new', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'a@test.local', name: 'أحمد' });
    const m = await createUser({ email: 'm@test.local', name: 'محمد' });
    const k = await createUser({ email: 'k@test.local', name: 'خالد' });
    const c = await loginAs('a@test.local');
    const made = (await c.post(`/api/comments/${post.id}`, { content: 'يا @محمد', mentions: [m.id] })).body.comment;

    const edited = await c.put(`/api/comments/${made.id}`, { content: 'يا @محمد ويا @خالد', mentions: [k.id] });
    expect(edited.body.comment.mentions.map((x: { name: string }) => x.name)).toEqual(['محمد', 'خالد']);
    expect(await mentionsOf(m.id)).toHaveLength(1);
    expect(await mentionsOf(k.id)).toHaveLength(1);

    const dropped = await c.put(`/api/comments/${made.id}`, { content: 'يا @خالد' });
    expect(dropped.body.comment.mentions).toEqual([{ id: k.id, name: 'خالد' }]);
    expect(await mentionsOf(k.id)).toHaveLength(1);
  });

  it('tags at most a few brothers in one comment', async () => {
    const { post } = await seedPost();
    await createUser({ email: 'a@test.local', name: 'أحمد' });
    const many = await Promise.all(Array.from({ length: MAX_MENTIONS + 2 }, (_, i) => createUser({ name: `أخ${i}` })));
    const c = await loginAs('a@test.local');
    const content = many.map((u) => `@${u.name}`).join(' ');
    const res = await c.post(`/api/comments/${post.id}`, { content, mentions: many.map((u) => u.id) });
    expect(res.body.comment.mentions).toHaveLength(MAX_MENTIONS);
  });
});

describe('tagging in a فائدة’s discussion', () => {
  async function sharedNote() {
    const w = await createUser({ email: 'w@test.local', name: 'كاتب' });
    const item = await prisma.learningItem.create({ data: { date: '2026-11-21', kind: 'reading', title: 'رياض الصالحين' } });
    const note = await prisma.learningNote.create({
      data: { userId: w.id, itemId: item.id, lessonTitle: item.title, lessonDate: item.date, text: 'فائدة', shared: true },
    });
    return { w, note };
  }

  it('tells the member tagged in a reply, and the writer only as a reply', async () => {
    const { w, note } = await sharedNote();
    await createUser({ email: 'a@test.local', name: 'أحمد' });
    const m = await createUser({ email: 'm@test.local', name: 'محمد' });
    const a = await loginAs('a@test.local');

    const res = await a.post(`/api/learning/notes/${note.id}/replies`, { text: '@محمد انظر هذه، @كاتب', mentions: [m.id, w.id] });
    expect(res.status).toBe(201);
    expect(res.body.reply.mentions.map((x: { name: string }) => x.name)).toEqual(['محمد', 'كاتب']);
    expect((await mentionsOf(m.id))[0]).toMatchObject({ learningNoteId: note.id, message: '@محمد انظر هذه، @كاتب' });
    expect((await prisma.notification.findMany({ where: { userId: w.id } })).map((n) => n.type)).toEqual(['learning_note_reply']);

    const inbox = (await (await loginAs('m@test.local')).get('/api/notifications')).body.notifications[0];
    expect(inbox).toMatchObject({ type: 'mention', learningNote: { id: note.id, lessonTitle: 'رياض الصالحين' } });
    expect((await a.get(`/api/learning/notes/${note.id}`)).body.replies[0].mentions).toHaveLength(2);
  });

  it('tells only the newly tagged when a reply is edited', async () => {
    const { note } = await sharedNote();
    await createUser({ email: 'a@test.local', name: 'أحمد' });
    const m = await createUser({ email: 'm@test.local', name: 'محمد' });
    const k = await createUser({ email: 'k@test.local', name: 'خالد' });
    const a = await loginAs('a@test.local');
    const reply = (await a.post(`/api/learning/notes/${note.id}/replies`, { text: '@محمد', mentions: [m.id] })).body.reply;
    const edited = await a.put(`/api/learning/notes/${note.id}/replies/${reply.id}`, { text: '@محمد و@خالد', mentions: [k.id] });
    expect(edited.body.reply.mentions.map((x: { name: string }) => x.name)).toEqual(['محمد', 'خالد']);
    expect(await mentionsOf(m.id)).toHaveLength(1);
    expect(await mentionsOf(k.id)).toHaveLength(1);
  });
});

describe('who can be tagged', () => {
  it('lists members by name for a signed-in member — names and photos, never emails', async () => {
    await createUser({ email: 'a@test.local', name: 'أحمد' });
    await createUser({ email: 'm1@test.local', name: 'محمد' });
    await createUser({ email: 'm2@test.local', name: 'عبد الله محمد' });
    await createUser({ email: 'k@test.local', name: 'خالد' });
    expect((await (await client()).get('/api/users/mentionable?q=م')).status).toBe(401);

    const a = await loginAs('a@test.local');
    const res = await a.get(`/api/users/mentionable?q=${encodeURIComponent('محمد')}`);
    expect(res.body.users.map((u: { name: string }) => u.name)).toEqual(['محمد', 'عبد الله محمد']);
    expect(Object.keys(res.body.users[0]).sort()).toEqual(['avatarUrl', 'id', 'name']);
    // Never oneself.
    expect((await a.get(`/api/users/mentionable?q=${encodeURIComponent('أحمد')}`)).body.users).toEqual([]);
  });
});

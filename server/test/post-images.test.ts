import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCategory, createUser, loginAs, prisma, resetDb } from './helpers.js';
import { postImageStore } from '../src/lib/postImages.js';
import { metaForPath } from '../src/lib/shareMeta.js';

const realStore = { ...postImageStore };
let uploads = 0;
let removed: string[] = [];
let failOnUpload: number | null = null;

beforeEach(async () => {
  await resetDb();
  uploads = 0;
  removed = [];
  failOnUpload = null;
  // Each "upload" stores the file's text, so tests can tell the photos apart.
  postImageStore.upload = async (buffer) => {
    uploads += 1;
    if (failOnUpload === uploads) throw new Error('cloud down');
    const name = buffer.toString();
    return { publicId: `pid-${name}`, url: `https://res.cloudinary.com/demo/image/upload/${name}.webp`, width: 800, height: 600 };
  };
  postImageStore.remove = async (publicId) => {
    removed.push(publicId);
  };
});

afterEach(() => {
  Object.assign(postImageStore, realStore);
});

async function writer() {
  const cat = await createCategory();
  await createUser({ email: 'w@test.local', role: 'writer', categoryIds: [cat.id] });
  return { cat, w: await loginAs('w@test.local') };
}

type Client = Awaited<ReturnType<typeof loginAs>>;

function send(c: Client, method: 'post' | 'put', url: string, fields: Record<string, string>, files: string[] = []) {
  let req = c.agent[method](url).set('X-CSRF-Token', c.csrf);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  for (const name of files) req = req.attach('images', Buffer.from(name), { filename: `${name}.png`, contentType: 'image/png' });
  return req;
}

const postFields = (categoryId: string) => ({ title: 'صور', description: 'نص', categoryId, postDate: '2026-10-15' });
const names = (images: { url: string }[]) => images.map((i) => i.url.match(/upload\/(.+)\.webp$/)![1]);

describe('posts with several images', () => {
  it('creates a post with images in upload order, returned by the list and the post', async () => {
    const { cat, w } = await writer();
    const res = await send(w, 'post', '/api/posts', postFields(cat.id), ['a', 'b', 'c']);
    expect(res.status).toBe(201);
    expect(names(res.body.post.images)).toEqual(['a', 'b', 'c']);
    expect(res.body.post.images[0]).toMatchObject({ width: 800, height: 600 });

    const one = (await w.get(`/api/posts/${res.body.post.id}`)).body;
    expect(names(one.images)).toEqual(['a', 'b', 'c']);
    expect(one).not.toHaveProperty('imageUrl');
    const list = (await w.get('/api/posts')).body.items;
    expect(names(list[0].images)).toEqual(['a', 'b', 'c']);
  });

  it('follows an explicit layout on create', async () => {
    const { cat, w } = await writer();
    const res = await send(w, 'post', '/api/posts', { ...postFields(cat.id), layout: JSON.stringify(['new:2', 'new:0', 'new:1']) }, ['a', 'b', 'c']);
    expect(names(res.body.post.images)).toEqual(['c', 'a', 'b']);
  });

  it('a post without images still works', async () => {
    const { cat, w } = await writer();
    const res = await send(w, 'post', '/api/posts', postFields(cat.id));
    expect(res.status).toBe(201);
    expect(res.body.post.images).toEqual([]);
  });

  it('edits: reorders, removes, and adds in one save, deleting only the removed files', async () => {
    const { cat, w } = await writer();
    const post = (await send(w, 'post', '/api/posts', postFields(cat.id), ['a', 'b', 'c'])).body.post;
    const [a, , c] = post.images;

    const res = await send(w, 'put', `/api/posts/${post.id}`, { ...postFields(cat.id), layout: JSON.stringify([c.id, 'new:0', a.id]) }, ['d']);
    expect(res.status).toBe(200);
    expect(names(res.body.post.images)).toEqual(['c', 'd', 'a']);
    expect(removed).toEqual(['pid-b']);
    expect(await prisma.postImage.count()).toBe(3);
  });

  it('an edit without a layout keeps the photos and appends new ones', async () => {
    const { cat, w } = await writer();
    const post = (await send(w, 'post', '/api/posts', postFields(cat.id), ['a'])).body.post;
    const res = await send(w, 'put', `/api/posts/${post.id}`, postFields(cat.id), ['b']);
    expect(names(res.body.post.images)).toEqual(['a', 'b']);
    // Text-only edit leaves them alone.
    const again = await send(w, 'put', `/api/posts/${post.id}`, { ...postFields(cat.id), title: 'جديد' });
    expect(names(again.body.post.images)).toEqual(['a', 'b']);
    expect(removed).toEqual([]);
  });

  it('removing every photo is allowed', async () => {
    const { cat, w } = await writer();
    const post = (await send(w, 'post', '/api/posts', postFields(cat.id), ['a', 'b'])).body.post;
    const res = await send(w, 'put', `/api/posts/${post.id}`, { ...postFields(cat.id), layout: '[]' });
    expect(res.body.post.images).toEqual([]);
    expect(removed.sort()).toEqual(['pid-a', 'pid-b']);
  });

  it('rejects bad layouts before uploading anything', async () => {
    const { cat, w } = await writer();
    const other = (await send(w, 'post', '/api/posts', postFields(cat.id), ['x'])).body.post;
    uploads = 0;
    const bad = [
      'not json',
      JSON.stringify(['new:1']), // only one file sent
      JSON.stringify(['new:0', 'new:0']),
      JSON.stringify([]), // the uploaded file isn't placed
      JSON.stringify([other.images[0].id, 'new:0']), // another post's photo
    ];
    for (const layout of bad) {
      const res = await send(w, 'post', '/api/posts', { ...postFields(cat.id), layout }, ['a']);
      expect(res.status, layout).toBe(400);
    }
    expect(uploads).toBe(0);
  });

  it('allows at most 10 photos', async () => {
    const { cat, w } = await writer();
    const eleven = Array.from({ length: 11 }, (_, i) => `p${i}`);
    expect((await send(w, 'post', '/api/posts', postFields(cat.id), eleven)).status).toBe(400);

    const post = (await send(w, 'post', '/api/posts', postFields(cat.id), eleven.slice(0, 10))).body.post;
    expect(post.images).toHaveLength(10);
    expect((await send(w, 'put', `/api/posts/${post.id}`, postFields(cat.id), ['one-more'])).status).toBe(400);
  });

  it('if one upload fails, the ones already stored are removed and no post is created', async () => {
    const { cat, w } = await writer();
    failOnUpload = 2;
    const res = await send(w, 'post', '/api/posts', postFields(cat.id), ['a', 'b', 'c']);
    expect(res.status).toBe(500);
    expect(removed).toEqual(['pid-a']);
    expect(await prisma.post.count()).toBe(0);
  });

  it('deleting a post deletes all its files', async () => {
    const { cat, w } = await writer();
    const post = (await send(w, 'post', '/api/posts', postFields(cat.id), ['a', 'b'])).body.post;
    expect((await w.del(`/api/posts/${post.id}`)).status).toBe(200);
    expect(removed.sort()).toEqual(['pid-a', 'pid-b']);
    expect(await prisma.postImage.count()).toBe(0);
  });

  it('another category’s writer cannot add photos', async () => {
    const { cat } = await writer();
    const otherCat = await createCategory();
    await createUser({ email: 'o@test.local', role: 'writer', categoryIds: [otherCat.id] });
    const o = await loginAs('o@test.local');
    expect((await send(o, 'post', '/api/posts', postFields(cat.id), ['a'])).status).toBe(403);
    expect(uploads).toBe(0);
  });

  it('the share preview uses the first photo', async () => {
    const { cat, w } = await writer();
    const post = (await send(w, 'post', '/api/posts', postFields(cat.id), ['cover', 'second'])).body.post;
    const meta = await metaForPath(`/post/${post.id}`);
    expect(meta.image).toContain('/image/upload/c_fill,g_auto,w_1200,h_630,q_auto,f_jpg/cover.webp');
  });
});

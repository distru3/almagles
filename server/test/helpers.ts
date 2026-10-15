import request from 'supertest';
import type { Role } from '@prisma/client';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';

export { app, prisma };

export const PASSWORD = 'correct-horse-battery';

/** Empties every table except Prisma's migration history. */
export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

let counter = 0;

export async function createUser(
  opts: { role?: Role; email?: string; name?: string; categoryIds?: string[]; canManageSchedule?: boolean } = {},
) {
  counter += 1;
  return prisma.user.create({
    data: {
      name: opts.name ?? `مستخدم ${counter}`,
      email: opts.email ?? `user${counter}@test.local`,
      passwordHash: await hashPassword(PASSWORD),
      role: opts.role ?? 'visitor',
      canManageSchedule: opts.canManageSchedule ?? false,
      managedCategories: opts.categoryIds ? { connect: opts.categoryIds.map((id) => ({ id })) } : undefined,
    },
  });
}

export async function createCategory(name = `قسم ${++counter}`) {
  return prisma.category.create({ data: { name, slug: `cat-${counter}` } });
}

/**
 * A browser-like client: keeps cookies between requests and sends the CSRF
 * header on every state-changing call, as the real frontend does.
 */
export async function client() {
  const agent = request.agent(app);
  const csrf: string = (await agent.get('/api/auth/csrf')).body.token;
  const send = (method: 'post' | 'put' | 'delete', url: string, body?: unknown) => {
    const req = agent[method](url).set('X-CSRF-Token', csrf);
    return body === undefined ? req : req.send(body as object);
  };
  return {
    agent,
    csrf,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: unknown) => send('post', url, body),
    put: (url: string, body?: unknown) => send('put', url, body),
    del: (url: string) => send('delete', url),
  };
}

/** A client already logged in as `email`. */
export async function loginAs(email: string) {
  const c = await client();
  const res = await c.post('/api/auth/login', { email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return c;
}

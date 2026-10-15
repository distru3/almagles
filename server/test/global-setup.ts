import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export const TEST_DB_PORT = 54329;

/**
 * Starts an in-memory Postgres for the whole run and applies every migration in
 * order, exactly as `prisma migrate deploy` would on a real database.
 */
export default async function setup() {
  const db = new PGlite();
  await db.exec("SET TIME ZONE 'UTC'"); // match production (Neon runs in UTC)

  const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');
  for (const dir of fs.readdirSync(migrations).filter((d) => !d.endsWith('.toml')).sort()) {
    await db.exec(fs.readFileSync(path.join(migrations, dir, 'migration.sql'), 'utf8'));
  }

  const server = new PGLiteSocketServer({ db, port: TEST_DB_PORT, host: '127.0.0.1' });
  await server.start();

  return async () => {
    await server.stop();
    await db.close();
  };
}

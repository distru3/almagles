// Runs before any test imports the app: env.ts reads these at import time.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.MAIL_DEV_MODE = '1'; // verification codes come back in the response
// pgbouncer=true: no named prepared statements, which a shared PGlite session would trip over.
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54329/postgres?connection_limit=1&sslmode=disable&pgbouncer=true';

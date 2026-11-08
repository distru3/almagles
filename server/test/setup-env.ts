// Runs before any test imports the app: env.ts reads these at import time.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.MAIL_DEV_MODE = '1'; // verification codes come back in the response
// pgbouncer=true: no named prepared statements, which a shared PGlite session would trip over.
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54329/postgres?connection_limit=1&sslmode=disable&pgbouncer=true';
// A throwaway key pair so push is 'configured'; tests swap the transport, nothing is really sent.
process.env.VAPID_PUBLIC_KEY = 'BLIsIvSqEavNUmOE7B4EUcXta48brMZmMWz5y8vk3ZAjojhAuEHDvdppX0bR7XDhnCZulJSDXPMkKAzSKvau7K4';
process.env.VAPID_PRIVATE_KEY = '7CAlfaJ3Ghoxi1Nbfjkm4sgCc74RBl_x9aAm8lzoktk';

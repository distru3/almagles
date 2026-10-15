import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // An in-memory Postgres (PGlite) with every migration applied; see test/global-setup.ts.
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    // PGlite serves one connection at a time, so all files share one worker
    // and one Prisma client, and run one after another.
    fileParallelism: false,
    maxWorkers: 1,
    isolate: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

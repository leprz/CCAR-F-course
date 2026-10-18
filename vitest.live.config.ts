import { defineConfig } from 'vitest/config';

// Live tests: call the real Claude API. Opt-in via `npm run test:live`.
export default defineConfig({
  test: {
    include: ['lessons/**/*.live.test.ts'],
    exclude: ['**/node_modules/**', '**/sandbox/**'],
    setupFiles: ['lib/testing/live-setup.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
  },
});

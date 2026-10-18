import { defineConfig } from 'vitest/config';

// Structural tests: offline, deterministic. Run against lessons/*/starter by default,
// or against lessons/*/solution with SOLUTION=1.
export default defineConfig({
  test: {
    include: ['lessons/**/*.test.ts', 'lib/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/*.live.test.ts', '**/node_modules/**', '**/sandbox/**'],
  },
});

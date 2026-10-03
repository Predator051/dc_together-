import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});

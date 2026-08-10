import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests hit a real Postgres; give them room.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});

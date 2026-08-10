import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only decorator-free *.logic.ts is unit-tested here; full DI boot is
    // exercised by the live smoke check during verification (docs/17).
    include: ['src/**/*.spec.ts'],
  },
});

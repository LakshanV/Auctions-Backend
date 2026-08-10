import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // Prisma's generated client is a runtime dependency, never bundled.
  external: ['@prisma/client', '.prisma/client'],
});

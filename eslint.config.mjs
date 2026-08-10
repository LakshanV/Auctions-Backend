import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Root flat ESLint config for the whole monorepo (see DECISIONS.md D-0008).
 * Framework-agnostic on purpose: typescript-eslint (non type-checked) + prettier
 * compatibility. Formatting is owned by Prettier; correctness by tsc's strict
 * flags. This keeps lint fast and free of framework-specific config drift.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.localdb/**',
      'database/generated/**',
      'database/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    // Config and script files run in Node and may use console freely.
    files: ['**/*.config.{js,mjs,ts}', 'scripts/**', '**/vitest.config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // NestJS DI relies on runtime type metadata (emitDecoratorMetadata), so
    // injected classes must be VALUE imports — `import type` would break DI.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  prettier,
);

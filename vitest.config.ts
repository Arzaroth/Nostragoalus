import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['{server,lib,db,shared,tests,app}/**/*.test.ts'],
    // pglite runs the full migration per DB test; allow headroom under parallel load.
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text', 'json-summary'],
      // Scope: the business logic - scoring, providers, sync, stats, crypto,
      // auth guards, the request-validation wrapper, shared helpers. The
      // interactive surface (app/components, app/pages, server/api handlers) is
      // NOT in the denominator: it has no component-test harness and is instead
      // guarded by `pnpm typecheck` (strict). The badge measures logic coverage.
      include: ['server/utils/**/*.ts', 'shared/**/*.ts', 'app/utils/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/types/**',
        'server/utils/providers/index.ts',
        'server/utils/http.ts',
      ],
      thresholds: {
        lines: 98,
        functions: 98,
        statements: 98,
        branches: 98,
      },
    },
  },
})

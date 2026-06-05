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
      include: ['server/utils/**/*.ts', 'shared/**/*.ts', 'app/utils/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/types/**',
        'server/utils/providers/index.ts',
        'server/utils/auth-guards.ts',
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

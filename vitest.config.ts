import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['{server,lib,db,shared,tests,app}/**/*.test.ts'],
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
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 95,
      },
    },
  },
})

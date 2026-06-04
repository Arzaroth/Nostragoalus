import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['{server,lib,db,shared,tests}/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['server/utils/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types/**', 'server/utils/providers/index.ts'],
      thresholds: {
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 95,
      },
    },
  },
})

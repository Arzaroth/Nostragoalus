import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

// Two projects: 'unit' (node env - logic, the coverage gate) and 'nuxt'
// (component/composable tests needing a Nuxt runtime). Coverage is scoped to the
// logic surface; the nuxt project doesn't execute it, so the union is the unit
// project's numbers.
export default defineConfig(async () => ({
  test: {
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text', 'json-summary'],
      include: ['server/utils/**/*.ts', 'shared/**/*.ts', 'app/utils/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/types/**',
        'server/utils/providers/index.ts',
        'server/utils/http.ts',
        'app/utils/image.ts', // canvas/Image DOM glue - no headless canvas to exercise it
      ],
      thresholds: { lines: 98, functions: 98, statements: 98, branches: 98 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['{server,lib,db,shared,tests,app}/**/*.test.ts'],
          exclude: ['**/*.nuxt.test.ts', '**/node_modules/**'],
          testTimeout: 30000,
          hookTimeout: 30000,
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          environment: 'nuxt',
          include: ['app/**/*.nuxt.test.ts'],
        },
      }),
    ],
  },
}))

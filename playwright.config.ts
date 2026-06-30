import { defineConfig, devices } from '@playwright/test'

// Browser e2e runs against an already-running stack (like the e2e:smtp script):
// bring it up with `mise run preview` (app + db + maildev + keycloak), then
// `pnpm e2e`. The app is on :3000, maildev's HTTP inbox on :1080, Keycloak on
// :8081 - overridable for CI via the E2E_* env vars.
const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  // Keep run artifacts out of the worktree: it sits under .claude/worktrees, which
  // the dev stack's app-dev bind-mounts, so writing here would thrash its file
  // watcher. Overridable via PLAYWRIGHT_OUTPUT_DIR.
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? '/tmp/ng-e2e-results',
  // Only the Playwright specs; the legacy node script (smtp-otp.e2e.mjs) is run
  // separately via `pnpm e2e:smtp` and must not be collected here.
  testMatch: '**/*.e2e.ts',
  // The specs share one DB (register an SSO provider, finalize a match, reset a
  // password), so they must not race each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Generous: a single spec drives signup + email verification + predict +
  // finalize + leaderboard against the HMR dev server (which compiles routes on
  // first hit).
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: APP,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})

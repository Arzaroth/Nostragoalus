import { readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Load .env.e2e (the isolated-stack ports/URLs) if present, without overriding an
// explicit env. So `mise run e2e` targets the disposable e2e stack by default,
// while E2E_* env vars still let you point at any other stack.
try {
  for (const line of readFileSync(new URL('.env.e2e', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
} catch {
  // no .env.e2e: fall back to the defaults baked into the helpers (dev stack)
}

// Browser e2e runs against an already-running stack: `mise run e2e` brings up the
// isolated ng-e2e stack (via e2e-up) and runs `pnpm e2e`. With .env.e2e loaded
// above, the app is on :3100, maildev's HTTP inbox on :1081 and Keycloak on :8080
// - all overridable via the E2E_* env vars (the defaults below are the dev stack).
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
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: APP,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The OIDC issuer is http://keycloak:8080 (so the app reaches Keycloak by
        // its compose service name); make the browser resolve `keycloak` to the
        // host's published port too, so one issuer URL works for both sides.
        launchOptions: { args: ['--host-resolver-rules=MAP keycloak 127.0.0.1'] },
      },
    },
  ],
})

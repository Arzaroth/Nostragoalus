// Capture the landing-page showcase screenshots with system Firefox
// (puppeteer-core over WebDriver BiDi). Run with the stack up + demo seed.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
mkdirSync('public/showcase', { recursive: true })

const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath: '/usr/bin/firefox',
  headless: true,
  defaultViewport: { width: 1380, height: 860 },
})

const page = await browser.newPage()

// sign in as the demo admin so prediction inputs and crowd totals render
// ?password=1 skips the identifier-first SSO domain check and shows the password field directly
await page.goto(`${APP}/login?password=1`, { waitUntil: 'networkidle0' })
await page.type('input[type="email"]', 'verify@example.com')
await page.type('input[type="password"]', 'password123')
await Promise.all([page.keyboard.press('Enter'), page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})])

const SHOTS = [
  { name: 'fixtures', path: '/world-cup-2026/matches', wait: 2500 },
  { name: 'match', path: process.env.MATCH_PATH ?? '/euro-2024/matches', wait: 3500 },
  { name: 'bracket', path: '/world-cup-2022/bracket', wait: 2500 },
  // the map's .client component only mounts on client-side navigation - reach
  // it by clicking through the app, then select France via its marker
  { name: 'map', clickThrough: true, wait: 2500, selector: '.leaflet-tile-loaded' },
  { name: 'ranking', path: '/world-cup-2022/leaderboard', wait: 2500 },
  // bot uses the finished demo competition so the consensus has real picks to
  // show; the /leagues page is intentionally NOT captured - it would expose live
  // join codes of real leagues.
  { name: 'bot', path: '/world-cup-2022/bot', wait: 3000 },
  { name: 'team', path: '/euro-2024/teams/ESP', wait: 4000 },
]

const only = process.env.ONLY
for (const shot of SHOTS) {
  if (only && shot.name !== only) continue
  try {
    if (shot.clickThrough) {
      await page.goto(`${APP}/world-cup-2026/matches`, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {})
      await page.click('a[href$="/map"]')
    } else {
      await page.goto(`${APP}${shot.path}`, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {})
    }
    if (shot.selector) await page.waitForSelector(shot.selector, { timeout: 20000 }).catch(() => console.log('  (selector never appeared)'))
    if (shot.clickThrough) {
      await page.click(`.leaflet-marker-icon img[src*='FRA']`).catch(() => console.log('  (FRA marker not found)'))
    }
    await new Promise((r) => setTimeout(r, shot.wait))
    await page.screenshot({ path: `public/showcase/${shot.name}.png` })
    console.log('shot', shot.name)
  } catch (e) {
    console.log('FAILED', shot.name, String(e.message ?? e).slice(0, 120))
  }
}

await browser.close()
console.log('done')

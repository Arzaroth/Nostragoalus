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
await page.goto(`${APP}/login?password=1`, { waitUntil: 'domcontentloaded' })
// Wait for the (client-rendered) password field before typing - otherwise we
// type into nothing and submit an empty/identifier-only form that never auths.
await page.waitForSelector('input[type="password"]', { timeout: 15000 })
await page.type('input[type="email"]', 'verify@example.com')
await page.type('input[type="password"]', 'password123')
// networkidle0 here (not domcontentloaded): it waits for the better-auth XHR +
// redirect so the session cookie is committed before we load gated pages. An
// optimistic redirect-off-/login fires before the cookie lands and everything
// then bounces back to /login.
await Promise.all([page.keyboard.press('Enter'), page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})])
await new Promise((r) => setTimeout(r, 1000))

// "Matches in full depth" needs a real match-detail page, not the fixtures
// list: discover a finished match (prefer the final) from the API.
async function apiGet(path) {
  const r = await fetch(`${APP}${path}`) // public endpoint, no auth needed
  return r.json()
}
let matchPath = process.env.MATCH_PATH ?? '/euro-2024/matches'
if (!process.env.MATCH_PATH) {
  try {
    const euroMatches = (await apiGet('/api/matches?competition=euro-2024')).matches ?? []
    const fm =
      euroMatches.find((m) => m.stage === 'FINAL' && m.status === 'FINISHED') ?? euroMatches.find((m) => m.status === 'FINISHED')
    if (fm) matchPath = `/euro-2024/matches/${fm.id}`
  } catch (e) {
    console.log('  (match discovery failed)', String(e.message ?? e).slice(0, 80))
  }
}

const SHOTS = [
  { name: 'fixtures', path: '/world-cup-2026/matches', wait: 2500 },
  { name: 'match', path: matchPath, wait: 3500 },
  // the bracket is wider than the viewport - clip to the bracket element itself
  // so the whole tree is captured (no side crop, no footer bleeding in).
  { name: 'bracket', path: '/world-cup-2022/bracket', wait: 2500, clip: '.br', viewport: { width: 1920, height: 1040 } },
  // the map's .client component only mounts on client-side navigation - reach
  // it by clicking through the app, then select France via its marker
  { name: 'map', clickThrough: true, wait: 2500, selector: '.leaflet-tile-loaded' },
  { name: 'ranking', path: '/world-cup-2022/leaderboard', wait: 2500 },
  // bot uses the finished demo competition so the consensus has real picks to
  // show; the /leagues page is intentionally NOT captured - it would expose live
  // join codes of real leagues.
  { name: 'bot', path: '/world-cup-2022/bot', wait: 3000 },
  { name: 'leagues', path: '/leagues', wait: 2500 },
  { name: 'team', path: '/euro-2024/teams/ESP', wait: 4000 },
]

const only = process.env.ONLY
for (const shot of SHOTS) {
  if (only && shot.name !== only) continue
  try {
    await page.setViewport(shot.viewport ?? { width: 1380, height: 860 })
    if (shot.clickThrough) {
      // The .client map only mounts on client-side navigation. Launch the SPA
      // from the bracket page (no live WebSocket - hydrates fast and reliably),
      // then click the Map nav. domcontentloaded, not networkidle0: the app
      // holds a WebSocket open so the network never goes idle.
      await page.goto(`${APP}/world-cup-2022/bracket`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
      await page.waitForSelector('a[href$="/map"]', { timeout: 15000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 3000))
      // Real coordinate mouse click on the visible nav link - synthetic and
      // elementHandle clicks don't drive Nuxt's router reliably here.
      const box = await page.evaluate(() => {
        const a = [...document.querySelectorAll('a[href$="/map"]')].find((x) => x.offsetParent)
        if (!a) return null
        const r = a.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })
      if (box) await page.mouse.click(box.x, box.y)
      const navOk = await page
        .waitForFunction(() => location.pathname.endsWith('/map'), { timeout: 15000 })
        .then(() => true)
        .catch(() => false)
      console.log(`  (map: nav ${navOk ? 'ok' : 'FAILED'})`)
    } else {
      await page.goto(`${APP}${shot.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
    }
    if (shot.selector) await page.waitForSelector(shot.selector, { timeout: 20000 }).catch(() => console.log('  (selector never appeared)'))
    if (shot.clickThrough) {
      await page.click(`.leaflet-marker-icon img[src*='FRA']`).catch(() => console.log('  (FRA marker not found)'))
    }
    await new Promise((r) => setTimeout(r, shot.wait))
    // clip: screenshot a single element (e.g. the full bracket, wider than the
    // viewport) instead of the cropped viewport.
    const target = shot.clip ? await page.$(shot.clip) : null
    await (target ?? page).screenshot({ path: `public/showcase/${shot.name}.png` })
    console.log('shot', shot.name)
  } catch (e) {
    console.log('FAILED', shot.name, String(e.message ?? e).slice(0, 120))
  }
}

await browser.close()
console.log('done')

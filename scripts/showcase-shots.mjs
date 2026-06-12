// Capture the landing-page showcase screenshots with system Firefox
// (puppeteer-core over WebDriver BiDi). Run with the stack up + demo seed.
// Each shot is captured in BOTH themes: light -> public/showcase/<name>.png,
// dark -> public/showcase/dark/<name>.png (the carousel serves the one matching
// the visitor's theme).
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
mkdirSync('public/showcase/dark', { recursive: true })

// One uniform viewport for every content shot so the carousel cards are all the
// same height (the bracket is the only exception - a wide clip, letterboxed in
// the carousel).
const VIEWPORT = { width: 1380, height: 1050 }
const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath: '/usr/bin/firefox',
  headless: true,
  defaultViewport: VIEWPORT,
})

const page = await browser.newPage()

// Sign in as the demo admin by calling the API from inside the page, so the
// browser stores the session cookie natively (the login form's submit is flaky
// headless; setting the cookie by hand misses better-auth's attributes).
await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
const authStatus = await page.evaluate(async () => {
  const r = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'verify@example.com', password: 'password123' }),
    credentials: 'include',
  })
  return r.status
})
console.log('  (sign-in status', authStatus + ')')

async function apiGet(path) {
  const r = await fetch(`${APP}${path}`) // public endpoint, no auth needed
  return r.json()
}
// "Matches in full depth" wants a real match-detail with a SHORT timeline so the
// stats below it are visible: pick a finished knockout with the fewest goals
// (>= 2 to avoid a bare 1-0 / 0-0), not the event-heavy final.
let matchPath = process.env.MATCH_PATH ?? '/euro-2024/matches'
if (!process.env.MATCH_PATH) {
  try {
    const finished = ((await apiGet('/api/matches?competition=euro-2024')).matches ?? []).filter((m) => m.status === 'FINISHED')
    const knockout = finished
      .filter((m) => ['R16', 'QF', 'SF'].includes(m.stage))
      .map((m) => ({ m, g: (m.fullTimeHome ?? 0) + (m.fullTimeAway ?? 0) }))
      .sort((a, b) => a.g - b.g)
    const pick = (knockout.find((x) => x.g >= 2) ?? knockout[0])?.m ?? finished.find((m) => m.stage === 'FINAL')
    if (pick) matchPath = `/euro-2024/matches/${pick.id}`
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
  // the map's .client component only mounts on client-side navigation - reach it
  // by clicking through the app, then select France via its marker.
  { name: 'map', clickThrough: true, wait: 2500, selector: '.leaflet-tile-loaded' },
  { name: 'ranking', path: '/world-cup-2022/leaderboard', wait: 2500 },
  { name: 'bot', path: '/world-cup-2022/bot', wait: 3000 },
  // ng-competition cookie makes the public-leagues browser default to WC 2026,
  // which has a real public league to show.
  { name: 'leagues', path: '/leagues', wait: 2500, cookies: [{ name: 'ng-competition', value: 'world-cup-2026' }] },
  // a group-stage team (3 games) so the squad/stats show, not a long history.
  { name: 'team', path: '/euro-2024/teams/CRO', wait: 4000 },
]

const only = process.env.ONLY
for (const shot of SHOTS) {
  if (only && shot.name !== only) continue
  try {
    await page.setViewport(shot.viewport ?? VIEWPORT)
    if (shot.cookies) for (const c of shot.cookies) await page.setCookie({ ...c, domain: 'localhost', path: '/' })
    if (shot.clickThrough) {
      // The .client map only mounts on client-side navigation. Launch the SPA
      // from the bracket page (no live WebSocket - hydrates fast and reliably),
      // then click the Map nav. domcontentloaded, not networkidle0: the app
      // holds a WebSocket open so the network never goes idle.
      await page.goto(`${APP}/world-cup-2022/bracket`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
      await page.waitForSelector('a[href$="/map"]', { timeout: 15000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 3000))
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
    // Hide the Admin nav item - the demo user is an admin, but the showcase
    // should look like an ordinary player's view.
    await page.addStyleTag({ content: 'a[href$="/admin"]{display:none !important}' }).catch(() => {})
    await new Promise((r) => setTimeout(r, shot.wait))

    // Capture both themes from the one load (toggle the .app-dark class).
    for (const theme of ['light', 'dark']) {
      await page.evaluate((d) => document.documentElement.classList.toggle('app-dark', d === 'dark'), theme)
      await new Promise((r) => setTimeout(r, 450))
      const dir = theme === 'dark' ? 'dark/' : ''
      const target = shot.clip ? await page.$(shot.clip) : null
      await (target ?? page).screenshot({ path: `public/showcase/${dir}${shot.name}.png` })
    }
    console.log('shot', shot.name)
  } catch (e) {
    console.log('FAILED', shot.name, String(e.message ?? e).slice(0, 120))
  }
}

await browser.close()
console.log('done')
